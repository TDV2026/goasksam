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
function activeWords(n){n=Math.max(0,Math.floor(n));var h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=n%60;return "Active time: "+(h?h+"h "+(m<10?"0":"")+m+"m":m?m+"m "+s+"s":s+"s")}
function clockShow(){var e=$("active");if(e)e.textContent=activeWords(clock.base+clock.run)}
function clockFlush(){var d=clock.run-clock.sent;if(d<1||!clock.id)return;clock.sent=clock.run;post({action:"case_active",id:clock.id,seconds:d}).catch(function(){})}
function clockStop(){if(clock.t){clearInterval(clock.t);clock.t=null}clockFlush()}
function clockStart(){if(clock.id===D.active&&clock.t){clockShow();return}clockStop();clock.id=D.active;clock.base=Number(C.activeSeconds)||0;clock.run=0;clock.sent=0;clockShow();clock.t=setInterval(function(){if(document.visibilityState==="hidden"||D.active!==clock.id)return;clock.run++;clockShow();if(clock.run-clock.sent>=30)clockFlush()},1000)}
window.addEventListener("pagehide",clockFlush);document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden")clockFlush()});
// ---------- small drawing helpers: a 20 unit line icon and a menu under a button ----------
function ico(paths,cls){var s=sv("svg",{viewBox:"0 0 20 20",width:"16",height:"16","class":"ic"+(cls?" "+cls:""),"aria-hidden":"true"});paths.forEach(function(d){s.appendChild(sv("path",{d:d}))});return s}
var IC={clock:["M10 3a7 7 0 1 0 0 14a7 7 0 0 0 0-14","M10 6v4.2l2.6 1.6"],person:["M10 9.5a3 3 0 1 0 0-6a3 3 0 0 0 0 6","M4 16.5c.5-3 2.7-4.6 6-4.6s5.5 1.6 6 4.6"],chev:["M5 8l5 5 5-5"],kebab:["M10 4.6v.1M10 10v.1M10 15.4v.1"],link:["M8.5 11.5l3-3","M7 13.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l2-2A2.5 2.5 0 0 1 8 9","M13 6.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-2 2A2.5 2.5 0 0 1 12 11"],tick:["M4.5 10.5l3.5 3.5 7.5-8"],pen:["M12.5 4.5l3 3L8 15l-3.6.6L5 12z"],mail:["M3 5.5h14v9H3z","M3 6l7 5 7-5"],doc:["M6 3h6l3 3v11H6z","M12 3v3h3"],car:["M3 11l1.5-4h11L17 11v4H3z","M3 11h14"]};
var openMenu=null;document.addEventListener("click",function(e){if(openMenu&&!e.target.closest(".menuw")){openMenu.hidden=true;openMenu=null}});
function menuBtn(btn,items){var w=el("span",{class:"menuw"}),m=el("div",{class:"menu",role:"menu",hidden:""});items.forEach(function(it){var b=el("button",{type:"button",role:"menuitem","data-go":it.id,text:it.label});b.addEventListener("click",function(){m.hidden=true;openMenu=null;it.run()});m.appendChild(b)});if(!items.length)btn.disabled=true;btn.addEventListener("click",function(e){e.stopPropagation();var on=m.hidden;if(openMenu&&openMenu!==m)openMenu.hidden=true;m.hidden=!on;openMenu=on?m:null});w.appendChild(btn);w.appendChild(m);return w}
// ---------- the header ----------
function head(){var h=$("s-head");h.textContent="";
 var acts=el("p",{class:"acts"},[ico(IC.clock),el("span",{id:"active",text:activeWords(clock.id===D.active?clock.base+clock.run:(Number(C.activeSeconds)||0))})]);clockStart();h.appendChild(acts);
 var who=(K.lifecycle&&K.lifecycle.assignedTo)||C.analyst||null,me=D.seat&&D.seat.displayName,mine=!!(who&&me&&who===me),albl=who?(mine?"Assigned to you":who):"Assign";
 var ab=el("button",{type:"button",class:"btn ob",id:"assignb","aria-haspopup":"true"},[ico(IC.person),el("span",{text:albl}),ico(IC.chev,"cv")]);
 var aitems=[];if(!mine)aitems.push({id:"claim",label:"Assign to me",run:function(){send("case_claim",{}).then(function(r){if(r&&r.ok)location.reload()})}});
 var moves=(K.lifecycle&&K.lifecycle.moves)||[];
 var kb=el("button",{type:"button",class:"btn ob kb",id:"kebab","aria-label":"More","aria-haspopup":"true"},[ico(IC.kebab)]);
 var kitems=moves.map(function(mv){return{id:"mv-"+mv.status,label:"Move to "+mv.label,run:function(){send("case_status",{status:mv.status}).then(function(r){if(r&&r.ok)location.reload()})}}});
 // THE KEBAB, under the status moves (Sam, Nov 15 2026): Re-read the email (a forwarded lead that is not finalized or archived), Retry market read (a case with no market answer), Archive, and Restore on an archived case. Each sends Lane D's op and the page shows what the server answers: the case redraws, or the server's sentence prints.
 function kact(action,after){return function(){post({action:action,id:D.active}).then(function(r){if(r&&r.ok){after(r)}else say((r&&(r.why||r.line))||"That did not work.")},function(){say("That did not work. The connection dropped.")})}}
 if(C.forwarded&&!C.archived&&K.status!=="finalized")kitems.push({id:"reread-email",label:C.rereadWord||"Re-read the email",run:kact("case_reread_email",function(r){if(r.case){K=r.case;C.kase=K;redraw()}else post({action:"case_get",id:D.active}).then(function(g2){if(g2&&g2.case){K=g2.case;C.kase=K}redraw()});if(r.line)say(r.line)})});
 if(!g("evidence"))kitems.push({id:"retry-market",label:"Retry market read",run:kact("case_reread_market",function(r){if(r.case){K=r.case;C.kase=K}if(r.readiness)C.readiness=r.readiness;redraw()})});
 if(C.archived)kitems.push({id:"restore",label:"Restore",run:kact("case_restore",function(){location.reload()})});else kitems.push({id:"archive",label:"Archive",run:kact("case_archive",function(){location.reload()})});
 var left=el("div",{class:"hl"},[el("h1",{class:"ct",id:"ct",text:C.title||""})]);
 var bits=[];if(C.sellerName)bits.push("Enquiry from "+C.sellerName);if(C.receivedLine)bits.push("Received "+C.receivedLine);
 left.appendChild(el("p",{class:"hm",id:"hmeta",text:bits.join(" · ")}));
 h.appendChild(el("div",{class:"hd2"},[left,el("div",{class:"hr"},[el("span",{class:"pill big","data-st":C.statusKey,id:"hpill",text:C.statusLabel||""}),menuBtn(ab,aitems),menuBtn(kb,kitems)])]));
 var pc=K.priorCases;if(pc&&pc.line){var pr=el("div",{class:"prior",id:"prior"},[el("p",{text:pc.line})]);if(pc.count>0&&(pc.items||[]).length){var ul2=el("ul");pc.items.forEach(function(x){ul2.appendChild(el("li",{},[el("a",{href:D.caseBase+x.id,text:x.title||x.id}),x.status?el("span",{class:"mute",text:" "+x.status}):null]))});pr.appendChild(ul2)}h.appendChild(pr)}}
// ---------- the vehicle card: the photo with its chip, the strip, and the details table ----------
var editing=false;
function gallery(){var items=(K.photos&&K.photos.items)||[],cover=items.filter(function(p){return p.id===(K.photos&&K.photos.coverId)})[0]||items[0];
 var box=el("div",{class:"gal",id:"gal"});box.appendChild(chooser());
 if(!cover){var eb=el("div",{class:"cover none",id:"cover"},[el("label",{class:"padd-box",id:"padd","for":"photofile"},[el("strong",{text:"Add photos"}),el("span",{text:"Click or drop JPG, PNG, WebP or HEIC. As many as you like."})])]);
  ["dragenter","dragover"].forEach(function(n){eb.addEventListener(n,function(e){e.preventDefault();eb.classList.add("over")})});["dragleave","drop"].forEach(function(n){eb.addEventListener(n,function(e){e.preventDefault();eb.classList.remove("over");if(n==="drop"&&e.dataTransfer)takePhotos(e.dataTransfer.files)})});
  box.appendChild(eb);box.appendChild(progList());return box}
 var im=el("img",{class:"cover",id:"cover",src:cover.url,alt:""}),wrap=el("div",{class:"cw"},[im]);wrap.appendChild(el("span",{class:"pchip",id:"pchip",text:items.length===1?"1 photo":items.length+" photos"}));box.appendChild(wrap);
 var st=el("div",{class:"strip",id:"pstrip"});items.slice(0,5).forEach(function(p){var t=el("button",{type:"button",class:"pt"+(p.id===cover.id?" on":""),"aria-label":p.name||"Photo"},[el("img",{src:p.url,alt:""})]);t.addEventListener("click",function(){im.src=p.url;[].forEach.call(st.querySelectorAll(".pt"),function(x){x.classList.remove("on")});t.classList.add("on")});
  var cb=el("button",{type:"button","data-cover":p.id,text:"Set as cover"}),rb=el("button",{type:"button","data-photoremove":p.id,text:"Remove"});
  cb.addEventListener("click",function(){edit("cover",{photoId:p.id}).then(function(r){if(r&&r.ok)redraw()})});
  rb.addEventListener("click",function(){edit("photo_remove",{item:p.id,photoId:p.id}).then(function(r){if(r&&r.ok)redraw()})});
  st.appendChild(el("div",{class:"ptw","data-photo":p.id},[t,el("div",{class:"pact"},[cb,rb])]))});
 if(items.length>5)st.appendChild(el("span",{class:"pt more",id:"pmore",text:"+"+(items.length-5)}));
 st.appendChild(el("label",{class:"pplus",id:"pplus","for":"photofile",title:"Add photos","aria-label":"Add photos",text:"+"}));box.appendChild(st);box.appendChild(progList());return box}
// ADD PHOTOS (order 2331): each chosen photo goes by its own road, never inside an edit body (the request limit is 4.5 MB): photo_upload_start, a PUT to the address the server made, photo_upload_commit. One at a time, each with its own mark; a refusal prints the server's own sentence.
function sendPhoto(f){var gone=function(w){return {ok:false,why:w}};
 return post({action:"case_edit",id:D.active,op:"photo_upload_start",name:f.name,size:f.size,type:f.type||""}).then(function(r){if(!r||!r.ok||!r.upload)return r||gone("That photo did not send. Try again.");
  return fetch(r.upload.url,{method:r.upload.method||"PUT",headers:{"content-type":f.type||"application/octet-stream"},body:f}).then(function(u){if(!u.ok)return gone("That photo did not reach storage. Try again.");return edit("photo_upload_commit",{upload:r.upload.id,name:f.name})},function(){return gone("That photo did not send. The connection dropped.")})},function(){return gone("That photo did not send. The connection dropped.")})}
// The chooser (one hidden input, the empty box and the plus tile both open it), the marks (kept outside the gallery so a redraw after each photo does not lose them), and one photo at a time. The cover shows as soon as the first photo is in: the case the commit answers with replaces the page's and the card redraws.
var up={rows:[],busy:false};
function progRows(l){l.textContent="";up.rows.forEach(function(r){l.appendChild(el("li",{"data-photo":r.name},[el("span",{class:"pn",text:r.name}),el("span",{class:r.bad?"pm bad":"pm",text:r.mark})]))})}
function progList(){var l=el("ul",{class:"pprog",id:"pprog"});progRows(l);return l}
function progDraw(){var l=$("pprog");if(l)progRows(l)}
function chooser(){var inp=el("input",{type:"file",id:"photofile",accept:"image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif",multiple:"",hidden:""});inp.addEventListener("change",function(){takePhotos(inp.files);inp.value=""});return inp}
function takePhotos(list){var fs=[].slice.call(list||[]).filter(function(f){return /^image\//.test(f.type)||/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)});if(!fs.length||up.busy)return;up.busy=true;up.rows=fs.map(function(f){return{name:f.name,mark:"Waiting",bad:false}});progDraw();
 var p=Promise.resolve(),bad=null;
 fs.forEach(function(f,i){p=p.then(function(){if(bad)return null;up.rows[i].mark="Sending";progDraw();return sendPhoto(f).then(function(q){if(q&&q.ok){up.rows[i].mark="Added";if(q.case){K=q.case;C.kase=K}redraw()}else{bad=q||{why:"That photo did not send. Try again."};up.rows[i].mark=bad.why||bad.line||"That photo did not send. Try again.";up.rows[i].bad=true}})})});
 p.then(function(){up.busy=false;up.rows.forEach(function(r){if(r.mark==="Waiting")r.mark="Not sent"});if(bad)say(bad.why||bad.line||"That photo did not send. Try again.");progDraw()})}
function frow(label,val,tag,key){var r=el("div",{class:"fr","data-field":key||label.toLowerCase()});r.appendChild(el("span",{class:"fl2",text:label}));var v=el("span",{class:"fv",text:val,title:val});r.appendChild(v);r.appendChild(tag?el("em",{class:"tg","data-tag":tag[0],text:tag[1]}):el("span"));
 if(key&&editing){v.setAttribute("tabindex","0");v.setAttribute("role","button");v.setAttribute("title","Edit");function go(){if(r.querySelector("input"))return;var f=(K.fields||{})[key],inp=el("input",{class:"txt",type:"text",value:f&&f.value!=null?String(f.value):""});v.textContent="";v.appendChild(inp);inp.focus();inp.select();var done=false;function fin(save){if(done)return;done=true;if(save&&inp.value.trim()!==(f&&f.value!=null?String(f.value):"")){edit("field",{field:key,value:inp.value.trim()}).then(function(){redraw()})}else vehicle()}inp.addEventListener("blur",function(){fin(true)});inp.addEventListener("keydown",function(e){if(e.key==="Enter")fin(true);if(e.key==="Escape")fin(false)})}v.addEventListener("click",go);v.addEventListener("keydown",function(e){if(e.key==="Enter")go()})}
 return r}
function vehicle(){var c=$("s-vehicle");c.textContent="";var F=K.fields||{},v=K.vehicle||{},rows=el("div",{class:"frs"+(editing?" editing":""),id:"frs"});
 function has(x){return x!=null&&x!==""}
 if(g("titleLine"))rows.appendChild(frow("Year / Make / Model",g("titleLine"),tagOf(F.model||F.make)));
 if(F.vin)rows.appendChild(frow("VIN",has(F.vin.value)?String(F.vin.value):"Not given",tagOf(F.vin),"vin"));
 if(F.mileage)rows.appendChild(frow("Mileage",has(F.mileage.value)?(v.mileageLine||String(F.mileage.value)):"Not given",tagOf(F.mileage),"mileage"));
 if(F.transmission)rows.appendChild(frow("Transmission",has(F.transmission.value)?String(F.transmission.value):"Not given",tagOf(F.transmission),"transmission"));
 if(g("specLine"))rows.appendChild(frow("Specification",g("specLine"),tagOf(F.trim||F.body)));
 if(C.askLine)rows.appendChild(frow("Seller asking price",C.askLine,["seller",C.tags.seller]));
 var loc=K.lead&&K.lead.locationLine;if(loc)rows.appendChild(frow("Location",loc,["seller",C.tags.seller]));
 var eb=el("button",{type:"button",class:"btn ob sm",id:"vedit","aria-pressed":editing?"true":"false",text:editing?"Done":"Edit"});eb.addEventListener("click",function(){editing=!editing;vehicle()});
 c.appendChild(el("div",{class:"vs"},[gallery(),el("div",{class:"vd"},[el("div",{class:"vdh"},[el("h3",{text:"Vehicle details"}),eb]),rows])]))}
// ---------- three small cards: the seller email, the documents, the previous auction history ----------
var KINDS=C.docKinds||[],DOCACCEPT=".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic",DOC_INLINE_BYTES=3145728;
function docKind(d){var k=d.kind==="service"?"invoice":d.kind;return KINDS.some(function(x){return x[0]===k})?k:"other"}
function readFile(f){return new Promise(function(res){var r=new FileReader();r.onload=function(){res(String(r.result).split(",")[1])};r.readAsDataURL(f)})}
// A document goes by one of two roads, as on /preview/desk: up to 3 MB inside the edit (doc_add); over that straight to storage on the address the server makes (doc_upload_start), then doc_upload_commit. The size only picks the road; the server decides the rest.
function sendDoc(f,kind){var title=f.name.replace(/\.[^.]+$/,"");if(f.size<=DOC_INLINE_BYTES)return readFile(f).then(function(b){return edit("doc_add",{kind:kind,title:title,name:f.name,data:b})});
 return post({action:"case_edit",id:D.active,op:"doc_upload_start",kind:kind,title:title,name:f.name,size:f.size}).then(function(r){if(!r||!r.ok){say((r&&(r.why||r.line))||"That did not send.");return r||{ok:false}}
  return fetch(r.upload.url,{method:r.upload.method||"PUT",headers:{"content-type":f.type||"application/octet-stream"},body:f}).then(function(u){if(!u.ok){say("That file did not send. Try again.");return {ok:false}}return edit("doc_upload_commit",{upload:r.upload.id,kind:kind,title:title,name:f.name})},function(){say("That file did not send. The connection dropped.");return {ok:false}})},function(){say("That did not send. The connection dropped.");return {ok:false}})}
// ---------- Seller's words: the four free-text answers, each short paragraph editable in place. case.sellerWords {description, flaws, upgrades, documentation}; when the case serves the words as documents (sellerWords:true, field) they read from there. Hidden when all four are empty. Documents below lists files only. ----------
var WORDS=[["description","Describe your car"],["flaws","Known flaws"],["upgrades","Replaced or upgraded"],["documentation","Documentation"]];
function wordsOf(){var o={},sw=K.sellerWords;if(sw&&typeof sw==="object"){WORDS.forEach(function(f){o[f[0]]=String(sw[f[0]]||"")});return o}(K.documents||[]).forEach(function(d){if(d&&d.sellerWords&&d.field){var k=d.field==="special"?"description":d.field;if(o[k]==null||!o[k])o[k]=String(d.text||"")}});WORDS.forEach(function(f){o[f[0]]=o[f[0]]||""});return o}
function words(){var c=$("s-words");if(!c)return;var o=wordsOf(),any=WORDS.some(function(f){return o[f[0]].trim()});c.hidden=!any;c.textContent="";if(!any)return;c.appendChild(el("h3",{text:"Seller's words"}));
 WORDS.forEach(function(f){var k=f[0],t=o[k].trim();if(!t)return;var row=el("div",{class:"sw","data-sw":k}),lab=el("span",{class:"rl",text:f[1]}),p=el("p",{class:"swt",text:t}),eb=el("button",{type:"button",class:"link sweb","data-swedit":k,text:"Edit"});
  eb.addEventListener("click",function(){var ta=el("textarea",{class:"txt swta","data-swin":k,rows:"3","aria-label":f[1]});ta.value=t;var sv=el("button",{type:"button",class:"btn sm pri","data-swsave":k,text:"Save"}),cn=el("button",{type:"button",class:"btn sm","data-swcancel":k,text:"Cancel"}),em=el("p",{class:"msg",role:"alert",hidden:""});
   cn.addEventListener("click",function(){words()});
   sv.addEventListener("click",function(){sv.disabled=true;edit("seller_words",{field:k,text:ta.value.trim()}).then(function(r){if(r&&r.ok){if(r.case)K=r.case;else{var sw=K.sellerWords&&typeof K.sellerWords==="object"?K.sellerWords:wordsOf();sw[k]=ta.value.trim();K.sellerWords=sw}C.kase=K;redraw()}else{sv.disabled=false;em.textContent=(r&&(r.why||r.line))||"";em.hidden=!em.textContent}},function(){sv.disabled=false})});
   row.textContent="";row.appendChild(lab);row.appendChild(ta);row.appendChild(el("div",{class:"btns"},[sv,cn]));row.appendChild(em);ta.focus()});
  row.appendChild(lab);row.appendChild(p);row.appendChild(eb);c.appendChild(row)})}
function small(){var w=$("s-three");w.textContent="";var se=K.sourceEmail,docs=(K.documents||[]).filter(function(d){return !d.sellerWords}),own=(K.vehicle||{}).ownBlock,none=K.desk&&K.desk.exact&&K.desk.exact.none;
 if(se){var vb=el("button",{type:"button",class:"btn ob sm",id:"enqlink","aria-expanded":"false",text:"View"}),box=el("div",{class:"enq",id:"enq",hidden:""});
  box.appendChild(se.url?el("a",{href:se.url,target:"_blank",rel:"noopener",text:se.name||""}):el("span",{text:se.name||""}));if(se.line)box.appendChild(el("p",{class:"mute",text:se.line}));
  vb.addEventListener("click",function(){var on=box.hidden;box.hidden=!on;vb.setAttribute("aria-expanded",on?"true":"false")});
  w.appendChild(el("section",{class:"card sm3",id:"c-email"},[el("div",{class:"sh"},[ico(IC.mail),el("h3",{text:"Seller email"}),vb]),el("p",{class:"one",text:se.line||se.name||""}),box]))}
 var ul=el("ul",{class:"dl"});docs.forEach(function(d){var got=d.status&&d.status!=="outstanding",u=d.url||d.doc_url,li=el("li",{"data-doc":d.id,class:got?"got":"out"},[got?ico(IC.tick,"tk"):el("span",{class:"tk none"}),el("span",{class:"dn",text:d.name||d.kindLabel||"Document",title:d.name||""})]);
  var sel=el("select",{class:"dk","data-kind":d.id,"aria-label":"Kind of document"}),cur=docKind(d);KINDS.forEach(function(k){var o=el("option",{value:k[0],text:k[1]});if(k[0]===cur)o.selected=true;sel.appendChild(o)});
  sel.addEventListener("change",function(){var prev=cur;edit("doc_kind",{doc:d.id,item:d.id,kind:sel.value}).then(function(r){if(r&&r.ok)redraw();else sel.value=prev})});li.appendChild(sel);
  if(u)li.appendChild(el("a",{class:"btn ob sm dv",href:u,target:"_blank",rel:"noopener",text:"View"}));
  var rm=el("button",{type:"button",class:"link dr","data-docremove":d.id,text:"Remove"});rm.addEventListener("click",function(){edit("doc_remove",{doc:d.id,item:d.id}).then(function(r){if(r&&r.ok)redraw()})});li.appendChild(rm);ul.appendChild(li)});
  var add=el("label",{class:"dadd",id:"docdrop","for":"docfile"},[el("span",{text:"Add a document"}),el("small",{text:"Click or drop a file"})]),fi=el("input",{type:"file",id:"docfile",accept:DOCACCEPT,hidden:""}),ak=el("select",{class:"dk",id:"dockind","aria-label":"Kind of the new document"});KINDS.forEach(function(k){ak.appendChild(el("option",{value:k[0],text:k[1]}))});
  function take(f){if(f)sendDoc(f,ak.value).then(function(r){if(r&&r.ok)redraw()})}
  fi.addEventListener("change",function(){take(fi.files[0]);fi.value=""});
  ["dragenter","dragover"].forEach(function(n){add.addEventListener(n,function(e){e.preventDefault();add.classList.add("over")})});
  ["dragleave","drop"].forEach(function(n){add.addEventListener(n,function(e){e.preventDefault();add.classList.remove("over");if(n==="drop"&&e.dataTransfer&&e.dataTransfer.files)take(e.dataTransfer.files[0])})});
  var addw=el("div",{class:"dadw"},[add,fi,ak]);
  w.appendChild(el("section",{class:"card sm3",id:"c-docs"},[el("div",{class:"sh"},[ico(IC.doc),el("h3",{text:"Documents ("+docs.length+")"})]),docs.length?ul:(K.documentsLine?el("p",{class:"one",text:K.documentsLine}):null),addw]))
 // THE CAR'S OWN HISTORY (Sam, Nov 15 2026): every prior appearance in vehicle.ownHistory, newest first as served, one row each, the whole row a link to its listing; the live match (vehicle.vinLiveMatch) is the first row, marked Listed now. Each row is the model's own line; nothing is worked out or reordered here. The heading carries the count of rows drawn.
 var oh=((K.vehicle||{}).ownHistory)||[],live=(K.vehicle||{}).vinLiveMatch,ll=live&&live.listing,hist=oh.length?oh:((own&&own.rows)||[]);
 if(hist.length||ll||none){var body=el("div",{class:"one ohl",id:"ohl"}),n=0;
  function orow(chip,text,url,kind){var kids=[];if(chip)kids.push(el("em",{class:"ohchip",text:chip}));kids.push(el("span",{class:"ohtx",text:text}));n++;return url?el("a",{class:"ohrow","data-own":kind,href:url,target:"_blank",rel:"noopener"},kids):el("span",{class:"ohrow","data-own":kind},kids)}
  if(ll){body.appendChild(orow("Listed now",[ll.bidLine,ll.venue||ll.platform,ll.mileageLine||ll.mileage,ll.endsLine].filter(Boolean).join(", ")||ll.title||"",ll.url,"live"))}
  hist.forEach(function(x){var t=typeof x==="string"?x:(x.line||x.text||"");if(t)body.appendChild(orow("",t,typeof x==="string"?null:x.url,(x&&x.kind)||""))});
  if(!n)body.appendChild(el("span",{class:"ow",text:none}));
  w.appendChild(el("section",{class:"card sm3",id:"c-prior","data-field":"auction"},[el("div",{class:"sh"},[ico(IC.car),el("h3",{id:"ohh",text:n?"This car's own history ("+n+")":((own&&own.heading)||"Previous auction history")})]),body]))}
 w.hidden=!w.firstChild}
// ---------- the market card: the strip and the chart in one row, the closing line under the chart ----------
var SVGNS="http://www.w3.org/2000/svg";function sv(t,a){var e=document.createElementNS(SVGNS,t);for(var x in a||{})e.setAttribute(x,a[x]);return e}
function cssv(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()||"#888"}
// NO MARKET ANSWER AND A RETRY LINE (Sam, Nov 15 2026): when the case serves no market answer (no desk.evidence) and a retry line (case.retry.line), the market card shows that line with a Retry button; the reserve box and the ladder show the same line and nothing else. Retry sends case_reread_market and redraws from the case the server answers with; a refusal prints the server's sentence.
function retryLine(){if(g("evidence"))return"";var r=K&&K.retry,l=r&&(typeof r==="string"?r:r.line);return l?String(l):""}
function retryMarket(c,rl){c.appendChild(el("p",{class:"rn",id:"mretry",text:rl}));var bt=el("button",{type:"button",class:"btn sm",id:"mretrybtn",text:"Retry"}),mg=el("p",{class:"msg",id:"mretrymsg",role:"alert",hidden:""});
 bt.addEventListener("click",function(){bt.disabled=true;mg.hidden=true;post({action:"case_reread_market",id:D.active}).then(function(r){if(r&&r.ok){if(r.case){K=r.case;C.kase=K}if(r.readiness)C.readiness=r.readiness;redraw();return}bt.disabled=false;mg.textContent=(r&&(r.why||r.line))||"The market could not be read again. Try again.";mg.hidden=false},function(){bt.disabled=false;mg.textContent="The market could not be read again. The connection dropped.";mg.hidden=false})});
 c.appendChild(bt);c.appendChild(mg)}
function market(){var c=$("s-market");c.textContent="";var e=ev();c.appendChild(el("div",{class:"sec-h"},[el("h3",{text:"Market evidence (summary)"}),retryLine()?null:lens()]));var rl0=retryLine();if(rl0){retryMarket(c,rl0);return}
 var rl=g("reserveLadder"),tl=rl&&rl.thin===true&&rl.thinLine?rl.thinLine:"";if(tl)c.appendChild(el("p",{class:"thinline",id:"thinline",text:tl}));
 var cells=e.strip||[],strip=el("div",{class:"mstrip",id:"mstrip"});cells.forEach(function(x){strip.appendChild(el("div",{class:"mc"+(x.emphasis?" em":""),"data-cell":x.key},[el("b",{class:"mcv",text:x.value}),el("span",{class:"mcl",text:x.label}),x.note?el("small",{text:x.note}):null,x.key==="count"&&bandNote()?el("small",{class:"bandnote",id:"mband",text:bandNote()}):null]))});
 var holder=el("div",{class:"plotw",id:"plotw"}),right=el("div",{class:"mr"},[holder]);
 c.appendChild(el("div",{class:"mrow"},[strip,right]));plot(holder);
 if(e.closingLine)right.appendChild(el("p",{class:"closing",id:"closing",text:e.closingLine}))}
function lens(){var seg=el("span",{class:"seg",id:"lens",role:"group","aria-label":"Period"}),e=ev();(g("windows")||[]).forEach(function(w){var b=el("button",{type:"button","data-m":w.months,class:Number(e.windowMonths)===Number(w.months)?"on":"",text:w.label});b.addEventListener("click",function(){if(b.classList.contains("on"))return;c0().classList.add("busy");edit("window",{months:w.months}).then(function(){c0().classList.remove("busy");redraw()})});seg.appendChild(b)});return seg}
function c0(){return $("s-market")}
function isH(x){return !!x&&(x.hagerty===true||String(x.venue||"").toLowerCase()==="hagerty"||x.platform==="Hagerty")}
var H=220;
function plot(holder){var e=ev(),sales=(g("sales")||[]).filter(function(s){return s.price>0});if(!sales.length||e.insufficient){return}
 var W=holder.clientWidth||440,lo=Infinity,hi=-Infinity;function ext(v){if(v!=null&&isFinite(v)){if(v<lo)lo=v;if(v>hi)hi=v}}
 sales.forEach(function(s){ext(s.price)});ext(e.q1);ext(e.q3);var rs=K.reserve||{},lad=g("reserveLadder"),rungs=lad&&Array.isArray(lad.rungs)?lad.rungs.filter(function(r){return r.available!==false&&r.figure!=null}):[];
 ext(rs.noReserve?null:rs.figure);rungs.forEach(function(r){ext(r.figure)});var pad=(hi-lo)*.06||1;lo-=pad;hi+=pad;
 function X(v){return 14+(v-lo)/(hi-lo)*(W-28)}var AX=H-44;
 var svg=sv("svg",{id:"plot",width:"100%",height:H,viewBox:"0 0 "+W+" "+H,role:"img","aria-label":"Completed sales"});
 if(e.q1!=null&&e.q3!=null)svg.appendChild(sv("rect",{id:"band",x:X(e.q1),y:58,width:X(e.q3)-X(e.q1),height:AX-58,rx:6,fill:cssv("--ev-soft")}));
 svg.appendChild(sv("line",{x1:14,x2:W-14,y1:AX,y2:AX,stroke:cssv("--line")}));
 if(e.median!=null)svg.appendChild(sv("line",{id:"mline",x1:X(e.median),x2:X(e.median),y1:58,y2:AX,stroke:cssv("--ev"),"stroke-width":1.5}));
 // THE RUNG FIGURES sit ABOVE the plot in two staggered rows (left to right, the first row the figure fits in), the figure of the rung in use is left to the marker label; the lines run from the plot's top to a short tick on the baseline.
 var lastR=[-999,-999],figRows=[38,53];rungs.slice().sort(function(a,z){return a.figure-z.figure}).forEach(function(r){var x=X(r.figure),ln=sv("line",{"class":"rungline","data-rung":r.key,x1:x,x2:x,y1:58,y2:AX+6,stroke:cssv("--mute"),"stroke-width":1,"stroke-dasharray":"4 3"});svg.appendChild(ln);if(rs.figure!=null&&r.figure===rs.figure&&!rs.noReserve)return;var tw=(r.figureLine||"").length*6.4+8,cx=Math.min(Math.max(x,tw/2+2),W-tw/2-2),row=-1;for(var k=0;k<2;k++){if(cx-tw/2>lastR[k]+4){row=k;break}}if(row<0)return;lastR[row]=cx+tw/2;var t=sv("text",{"class":"rungfig","data-rung":r.key,x:cx,y:figRows[row],"text-anchor":"middle","font-size":11,fill:cssv("--mute")});t.textContent=r.figureLine||"";svg.appendChild(t)});
 // THE PRICE AXIS under the baseline: the model's own ticks for the window on screen (evidence.byWindow[months].axisTicks, each {value,label}), printed as sent; none sent means no axis. Ticks that would touch the previous label, or fall outside the plot, are left out.
 var wn=e.byWindow&&e.byWindow[String(e.windowMonths)],tks=(wn&&Array.isArray(wn.axisTicks)?wn.axisTicks:[]).slice().sort(function(a,z){return a.value-z.value}),lastT=-999,ax=sv("g",{id:"axis","aria-hidden":"true"});tks.forEach(function(t){var x=X(t.value);if(x<14||x>W-14)return;var lw=String(t.label||"").length*6.2+10;if(x-lw/2<lastT+6)return;lastT=x+lw/2;var cx=Math.min(Math.max(x,lw/2+2),W-lw/2-2);ax.appendChild(sv("line",{"class":"tick","data-tick":t.value,x1:x,x2:x,y1:AX,y2:AX+5,stroke:cssv("--mute")}));var tl=sv("text",{"class":"ticklabel","data-ticklabel":t.value,x:cx,y:AX+22,"text-anchor":"middle","font-size":11,fill:cssv("--mute")});tl.textContent=t.label;ax.appendChild(tl)});svg.appendChild(ax);
 sales.forEach(function(s,i){var d=sv("circle",{cx:X(s.price),cy:AX-14-((i*19)%(AX-84)),r:3.6,fill:isH(s)?cssv("--an"):cssv("--ev-dot"),"data-sale":s.id});if(isH(s))d.setAttribute("data-hagerty","1");svg.appendChild(d)});
 if(rs.figure!=null&&!rs.noReserve&&rs.figureLine){var x=X(rs.figure),lw=Math.max(52,rs.figureLine.length*7.4+16),lx=Math.min(Math.max(x-lw/2,2),W-lw-2);svg.appendChild(sv("line",{id:"resmark","data-figure":rs.figure,x1:x,x2:x,y1:24,y2:AX,stroke:cssv("--an"),"stroke-width":2.5}));svg.appendChild(sv("circle",{cx:x,cy:AX,r:4.5,fill:cssv("--an")}));
  svg.appendChild(sv("rect",{id:"reslabel",x:lx,y:2,width:lw,height:22,rx:5,fill:cssv("--accent")}));var tx=sv("text",{x:lx+lw/2,y:17,"text-anchor":"middle","font-size":12.5,"font-weight":600,fill:cssv("--accent-ink"),id:"reslabeltx"});tx.textContent=rs.figureLine;svg.appendChild(tx)}
 holder.appendChild(svg)}
// ---------- Closest sales: the first four as rows, View all for the rest ----------
var showAll=false;
function exclOf(c){var x=(K.exclusions||[]).filter(function(e){return String(e.saleId)===String(c.id)})[0];return c.exclusion||x||null}
function inRep(c){return (K.selectedComparables||[]).map(String).indexOf(String(c.id))>=0}
function card(c){var ex=exclOf(c),why=c.whyLine||c.why,box=el("article",{class:"sc"+(ex?" ex":"")+(isH(c)?" hag":""),"data-sale":c.id});
 box.appendChild(c.photo?el("img",{class:"sph",src:c.photo,alt:""}):el("div",{class:"sph none"}));
 var mid=el("div",{class:"sb"});mid.appendChild(el("div",{class:"stt",text:c.title||""}));
 mid.appendChild(el("div",{class:"sm",text:[c.milesLine,c.platform,c.dateLine].filter(Boolean).join(" · ")}));if(isH(c))mid.appendChild(el("span",{class:"hmark",text:"Hagerty"}));box.appendChild(mid);
 box.appendChild(el("p",{class:"sw",text:ex?"Excluded: "+(ex.reason||""):(why||"")}));
 var pr=el("div",{class:"spc"});var top=el("div",{class:"sp"},[el("b",{class:"spr",text:c.priceLine||""}),c.url?el("a",{class:"slink",href:c.url,target:"_blank",rel:"noopener","aria-label":"Open the listing"},[ico(IC.link)]):null]);pr.appendChild(top);
 if(ex){var rb=el("button",{type:"button",class:"btn sm","data-restore":c.id,text:"Restore"});rb.addEventListener("click",function(){edit("restore",{saleId:String(c.id)}).then(function(){redraw()})});pr.appendChild(rb)}
 else{var act=el("div",{class:"sa"}),lab=el("label",{class:"inr"}),cb=el("input",{type:"checkbox","data-tick":c.id});cb.checked=inRep(c);cb.addEventListener("change",function(){var ids=(K.selectedComparables||[]).map(String),i=ids.indexOf(String(c.id));if(cb.checked&&i<0)ids.push(String(c.id));else if(!cb.checked&&i>=0)ids.splice(i,1);K.selectedComparables=ids;edit("comparables",{ids:ids}).then(function(){redraw()})});lab.appendChild(cb);lab.appendChild(el("span",{text:"In report"}));act.appendChild(lab);
  var xb=el("button",{type:"button",class:"btn sm","data-exclude":c.id,text:"Exclude"}),form=el("div",{class:"xf",hidden:""},[el("input",{class:"txt","data-reason":c.id,type:"text",placeholder:"Why exclude this sale",autocomplete:"off","aria-label":"Reason"}),el("button",{type:"button",class:"btn sm pri","data-confirm":c.id,text:"Exclude"})]);
  function sub(){var inp=form.querySelector("input"),why2=inp.value.trim();if(!why2){inp.placeholder="Say why first";inp.focus();return}edit("exclude",{saleId:String(c.id),scope:"market_calc",reason:why2}).then(function(r){if(r&&r.ok){redraw()}})}
  xb.addEventListener("click",function(){form.hidden=!form.hidden;if(!form.hidden)form.querySelector("input").focus()});form.querySelector("button").addEventListener("click",sub);form.querySelector("input").addEventListener("keydown",function(e){if(e.key==="Enter")sub()});
  act.appendChild(xb);pr.appendChild(act);pr.appendChild(form)}
 box.appendChild(pr);return box}
function closest(){var c=$("s-closest");c.textContent="";var list=g("comparables")||[],ordered=list.filter(isH).concat(list.filter(function(x){return !isH(x)})),n=g("comparablesCount")!=null?g("comparablesCount"):list.length;
 var h=el("div",{class:"sec-h"},[el("h3",{text:"Closest sales"})]);
 if(n>4){var all=el("button",{type:"button",class:"link",id:"viewall","aria-expanded":showAll?"true":"false",text:showAll?"Show fewer":"View all "+n+" sales"});all.addEventListener("click",function(){showAll=!showAll;closest()});h.appendChild(all)}c.appendChild(h);
 if(!ordered.length){if(g("comparablesNote"))c.appendChild(el("p",{class:"mute",text:g("comparablesNote")}));return}
 var grid=el("div",{class:"sgrid",id:"sgrid"});(showAll?ordered:ordered.slice(0,4)).forEach(function(x){grid.appendChild(card(x))});c.appendChild(grid)}
head();vehicle();words();small();market();closest();
// ---------- the right rail, Recommendation (sticky): condition, the market's range, the reserve, the ladder, the notes, the checks, then the three buttons ----------
var CONDS=["Concours","Excellent","Good","Fair"],pickedCond=null,noteDraft=null,SAID={mileage_unconfirmed:"mileage",accident_unclear:"accident_history",service_documents:"service_history"};
function same(a,b){return String(a).toLowerCase()===String(b).toLowerCase()}
function cname(v){return v==null?"":typeof v==="string"?v:(v.name||"")}
function carCond(){var c=K.condition;return c?cname(c.chosen):""}
function tierOf(n){var r=(g("rungs")||[]).filter(function(x){return same(x.name,n)})[0];return r?r.tier:CONDS.indexOf(n)+1}
function sect(id,cls){var d=el("section",{class:"rs "+(cls||""),id:id});return d}
// THE PREVIEW (Sam, Nov 15 2026): a condition button previews that condition at once, before Save. Nothing is worked out here and nothing is asked of the server: the tier's rung and reason are reserveLadder.byCondition[tier] as served, the figure is that rung's own figureLine from the served ladder. A "Not saved" mark stays on the reserve box until Save; Cancel, or the saved condition clicked again, puts the saved state back.
function bcOf(t,n){var l=g("reserveLadder"),b=l&&l.byCondition;if(!b)return null;var ln=String(n||"").toLowerCase();function hit(y){return !!y&&typeof y==="object"&&(Number(y.tier)===Number(t)||(n&&String(y.name||"").toLowerCase()===ln))}
 if(Array.isArray(b))return b.filter(hit)[0]||null;if(b[t]&&b[t].key!==undefined)return b[t];return Object.keys(b).map(function(k){return b[k]}).filter(hit)[0]||null}
function pvOf(){if(!pickedCond)return null;var l=g("reserveLadder"),bc=bcOf(tierOf(pickedCond),pickedCond),NONE={key:null,fig:"",reason:"",effect:""};if(!l||!bc||!bc.key)return NONE;var r=(l.rungs||[]).filter(function(x){return x.key===bc.key})[0];if(!r)return NONE;return{key:bc.key,fig:bc.key==="noReserve"?"No reserve":(r.figureLine||""),reason:bc.reason||l.reason||"",effect:bc.effect||bc.reason||""}}
// The effect line is the model's sentence. A served count of 0 never prints "Figures use the 0 ... sales": the model's thin line, or its no-reserve line, prints instead.
function effectOf(){var c=K.condition||{},l=g("reserveLadder")||{},p=pvOf();if(p)return p.effect;var e=c.effectLine||"";if(!e)return"";if(ev().count!=null&&Number(ev().count)===0){var nr=(l.rungs||[]).filter(function(x){return x.key==="noReserve"})[0];return c.thinLine||l.thinLine||(nr&&nr.line)||""}return e}
function pvDraw(){condP();reserveP();ladderP()}
function condP(){var b=$("rcond");b.textContent="";var c=K.condition||{},cur=carCond();
  var row=el("div",{class:"crow"},[el("span",{class:"rl2",text:"Condition"})]);
  var bx=el("div",{class:"seg2",id:"cbtns",role:"group","aria-label":"Condition"});CONDS.forEach(function(n){var on=same(n,cur);var bt=el("button",{type:"button","data-cond":n,"aria-pressed":on?"true":"false",class:on?"on":(pickedCond&&same(n,pickedCond)?"pick":""),text:n});bt.addEventListener("click",function(){pickedCond=same(n,cur)?null:(pickedCond&&same(n,pickedCond)?null:n);if(!pickedCond)noteDraft=null;pvDraw()});bx.appendChild(bt)});row.appendChild(bx);b.appendChild(row);
  if(c.line)b.appendChild(el("p",{class:"rn",id:"cline",text:c.line}));
  var saved=c.source==="analyst"&&c.note?c.note:"";
  if(pickedCond||saved){var ni=el("input",{class:"txt",id:"cnoteIn",type:"text",autocomplete:"off",placeholder:"Why this condition","aria-label":"Condition note",value:noteDraft!=null?noteDraft:saved});b.appendChild(ni);
   var sv2=el("button",{type:"button",class:"btn sm pri",id:"csave",text:"Save"});sv2.disabled=true;
   function sync(){var t=ni.value.trim(),want=!!(pickedCond||cur),need=want&&!t;sv2.disabled=!(want&&t&&(pickedCond||t!==saved));sv2.textContent=need?"Add a note to save":"Save";ni.placeholder=need?"Why this condition (needed to save)":"Why this condition"}
   ni.addEventListener("input",function(){noteDraft=ni.value;sync()});sync();
   var msg=el("p",{class:"msg",id:"cmsg",hidden:""});
   sv2.addEventListener("click",function(){var t=ni.value.trim(),want=pickedCond||cur;if(!want||!t)return;sv2.disabled=true;send("condition_set",{condition:tierOf(want),note:t}).then(function(r){if(r&&r.ok){pickedCond=null;noteDraft=null;redraw()}else{msg.textContent=(r&&(r.why||r.line))||"That did not save.";msg.hidden=false;sync()}})});
   b.appendChild(sv2);
   if(pickedCond){var cx=el("button",{type:"button",class:"btn sm",id:"ccancel",text:"Cancel"});cx.addEventListener("click",function(){pickedCond=null;noteDraft=null;pvDraw()});b.appendChild(cx)}
   b.appendChild(msg)}
  var ef=effectOf();if(ef)b.appendChild(el("p",{class:"thinline",id:"ceffect",text:ef}))}
function rangeP(){var b=$("rrange");b.textContent="";var e=ev();if(!e.typicalLine||e.insufficient)return;b.appendChild(el("span",{class:"rl",id:"rrl",text:"Market range"+(e.countLine?", "+e.countLine:"")}));b.appendChild(el("b",{class:"rv num",id:"rrv",text:e.typicalLine}));var bn=bandNote();if(bn)b.appendChild(el("p",{class:"bandnote",id:"rband",text:bn}))}
function bandNote(){var n=g("bandNote");return typeof n==="string"?n.trim():""}
function lstate(){var lad=g("reserveLadder");lad=lad&&Array.isArray(lad.rungs)&&lad.rungs.length?lad:null;var ch=K.reserveChoice||{},p=lad?pvOf():null,key=lad?(p?p.key:(ch.key||lad.recommended||null)):null,rung=lad&&key?lad.rungs.filter(function(r){return r.key===key})[0]||null:null;return{lad:lad,key:rung?key:null,rung:rung,on:!!rung,ch:ch,pv:p}}
function reserveP(){var b=$("rres");b.textContent="";var r=K.reserve||{},ls=lstate();var rl0=retryLine();if(rl0){b.appendChild(el("p",{class:"rn",id:"lreason","data-retry":"1",text:rl0}));return}
 var fig=ls.pv?ls.pv.fig:(ls.on&&ls.key==="noReserve"?"No reserve":(r.figureLine||(ls.on?ls.rung.figureLine:"")||""));
 b.appendChild(el("div",{class:"rh"},[el("span",{class:"rl",text:"Recommended reserve"}),ls.pv?el("span",{class:"nsm",id:"rnsv",text:"Not saved"}):null]));if(fig)b.appendChild(el("b",{class:"rfig num",id:"rfig",text:fig}));
 var why=ls.pv?ls.pv.reason:(ls.ch&&ls.ch.line?ls.ch.line:"");if(why)b.appendChild(el("p",{class:"rn",id:"lreason",text:why}));
 var nl=g("likely")&&g("likely").nearestLine;if(nl)b.appendChild(el("p",{class:"rn",id:"nearestLine",text:nl}))}
function ladderP(){var b=$("rlad");b.textContent="";var rl0=retryLine();if(rl0){b.appendChild(el("p",{class:"rn",id:"lretry",text:rl0}));return}var ls=lstate();if(!ls.lad)return;var keys=((K.report&&K.report.rungs&&K.report.rungs.keys)||[]).map(String);
 var rungs=ls.lad.rungs.slice();var order=["safe","balanced","ambitious","noReserve"];rungs.sort(function(a,z){var i=order.indexOf(a.key),j=order.indexOf(z.key);return (i<0?9:i)-(j<0?9:j)});
 var ch=ls.ch||{},own=!ls.pv&&ch.source==="analyst"&&(ch.key==="custom"||!ch.key)&&K.reserve&&K.reserve.figureLine;
 function row(key,fig,line,avail,use,rec,own2){var rw=el("label",{class:"lrow"+(use?" use":"")+(avail?"":" off"),"data-rung":key}),rd=el("input",{type:"radio",name:"rung",value:key,"aria-label":key==="noReserve"?"No reserve":fig});rd.checked=use;rd.disabled=!avail;
  rw.appendChild(rd);var mid=el("span",{class:"lmid"},[el("b",{class:"lfg num",text:fig}),rec?el("em",{class:"lrec",text:"Recommended"}):null,own2?el("em",{class:"lrec own",text:"Your figure"}):null]);if(line)mid.appendChild(el("span",{class:"lln",text:line}));rw.appendChild(mid);
  if(avail&&!own2){var cb=el("input",{type:"checkbox","data-tick":key,"aria-label":"Include in the report",class:"ltick"});cb.checked=use||keys.indexOf(key)>=0;cb.disabled=use;cb.addEventListener("click",function(e){e.stopPropagation()});cb.addEventListener("change",function(){var ks=[].filter.call(b.querySelectorAll("[data-tick]"),function(c){return c.checked}).map(function(c){return c.getAttribute("data-tick")});send("report_rungs_set",{keys:ks})});rw.appendChild(cb)}
  if(avail&&!own2)rd.addEventListener("change",function(){if(rd.checked)send("reserve_use",{key:key}).then(function(x){if(x&&x.ok)redraw()})});return rw}
 var RN={safe:"Safe",balanced:"Balanced",ambitious:"Ambitious",noReserve:"No reserve"};rungs.forEach(function(r){var off=r.available===false;b.appendChild(row(r.key,off?(RN[r.key]||r.key):(r.key==="noReserve"?"No reserve":(r.figureLine||"")),r.line||(off?(ls.lad.thinLine||""):""),r.available!==false,!own&&ls.key===r.key,ls.lad.recommended===r.key,false))})
 // CUSTOM, the fifth row: a figure the analyst types. Use sends reserve_use with that figure; the model answers with its own cleared count for it (reserveChoice.line), which the row prints like the others. Nothing is counted here.
 var cw=el("div",{class:"lrow cust"+(own?" use":""),"data-rung":"custom"}),cl=el("span",{class:"lmid"},[el("b",{class:"lfg",text:"Custom"}),own?el("b",{class:"lfg num",id:"cshown",text:K.reserve.figureLine}):null,own&&ch.line?el("span",{class:"lln",id:"cline2",text:ch.line}):null]),ci=el("input",{class:"txt cfig",id:"cfig",type:"text",inputmode:"numeric",autocomplete:"off",placeholder:"Type a figure","aria-label":"Custom reserve figure"}),cu=el("button",{type:"button",class:"btn sm pri",id:"cuse",text:"Use"}),ce=el("p",{class:"msg",id:"cerr",role:"alert",hidden:""});cu.disabled=true;
 ci.addEventListener("input",function(){cu.disabled=!(Number(ci.value.replace(/[$,\s]/g,""))>0);ce.hidden=true});
 cu.addEventListener("click",function(){var n=Number(ci.value.replace(/[$,\s]/g,""));if(!(n>0))return;cu.disabled=true;send("reserve_use",{key:"custom",figure:n}).then(function(x){if(x&&x.ok)redraw();else{cu.disabled=false;ce.textContent=(x&&(x.why||x.line))||"";ce.hidden=!ce.textContent}},function(){cu.disabled=false})});
 cw.appendChild(cl);cw.appendChild(el("span",{class:"cin"},[ci,cu]));cw.appendChild(ce);b.appendChild(cw)}
var whyT=null;
function whyP(){var b=$("rwhy");var ta=b.querySelector("textarea");var r=K.reserve||{};if(ta){if(document.activeElement!==ta)ta.value=r.why||"";return}
 b.appendChild(el("label",{for:"why",class:"rl2",text:"Analyst notes (will appear in report)"}));ta=el("textarea",{id:"why",rows:"3","aria-label":"Analyst notes, printed in the report"});ta.value=r.why||"";
 ta.addEventListener("input",function(){var t=ta.value;clearTimeout(whyT);whyT=setTimeout(function(){edit("reserve",{patch:{why:t}}).then(function(){footP()})},500)});b.appendChild(ta)}
function readFile(f){return new Promise(function(res){var r=new FileReader();r.onload=function(){res(String(r.result).split(",").pop())};r.readAsDataURL(f)})}
function needsP(){var b=$("rneeds");b.textContent="";var list=K.needs_review||[],open=list.filter(function(n){return n.state==="open"});if(!list.length)return;
 b.appendChild(el("h3",{class:"rh2",text:"Checks and next steps"+(open.length?" ("+open.length+")":"")}));
 list.forEach(function(n){var row=el("div",{class:"nd"+(n.state==="open"?" need":" done"),"data-need":n.id});
  if(n.state!=="open"){row.appendChild(ico(IC.tick,"tk"));row.appendChild(el("span",{text:n.label+(n.state==="waived"&&n.reason?" (waived: "+n.reason+")":"")}));b.appendChild(row);return}
  row.appendChild(el("span",{class:"nl"},[el("span",{class:"tk none"}),el("span",{text:n.label})]));
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
 var row=el("div",{class:"btns"});var pv=el("button",{type:"button",class:"btn pri",id:"bPrev",text:"Preview seller report"}),fz=el("button",{type:"button",class:"btn ob",id:"bFin",text:"Finalize and send"}),sd=el("button",{type:"button",class:"btn ob",id:"bDraft",text:"Save draft"});
 fz.disabled=!R.ready&&!fin;var bl=(!R.ready&&!fin&&Array.isArray(R.blockers))?R.blockers.filter(function(x){return x&&x.why}):[];row.appendChild(pv);row.appendChild(fz);
 if(bl.length)row.appendChild(el("div",{class:"fblk",id:"fblk"},bl.map(function(x){return el("p",{class:"fhint","data-blocker":x.key,text:x.why})})));row.appendChild(sd);b.appendChild(row);
 var hint=fin?"":(R.hint||K.finalizeHint||"");if(!R.ready&&!fin&&!bl.length){(lines.filter(function(l){return l.ok===false}).length?lines.filter(function(l){return l.ok===false}):[]).forEach(function(l){b.appendChild(el("p",{class:"fhint","data-key":l.key,text:l.line||""}))});if(hint)b.appendChild(el("small",{id:"finHint",text:hint}))}
 if(fin)b.appendChild(el("p",{class:"fhint ok",id:"finBox",text:"Finalized as version "+K.version+". Locked."}));
 var h=K.handling||{},sent=(h.sentLines&&h.sentLines.length?h.sentLines:(h.sentLine?[h.sentLine]:[]));sent.forEach(function(t){b.appendChild(el("p",{class:"fhint ok","data-sent":"1",text:t}))});
 pv.addEventListener("click",preview);
 sd.addEventListener("click",function(){clearTimeout(whyT);var ta=$("why"),t=ta?ta.value:null;var p=t!=null?edit("reserve",{patch:{why:t}}):Promise.resolve({ok:true});p.then(function(r){if(r&&r.ok){sd.textContent="Draft saved";setTimeout(function(){sd.textContent="Save draft"},1600)}})});
 fz.addEventListener("click",function(){if(fz.disabled)return;if(K.status==="finalized"){openSend();return}fz.disabled=true;post({action:"case_finalize",id:D.active}).then(function(r){if(r&&r.ok){if(r.case){K=r.case;C.kase=K}C.readiness={ready:true,blockers:[]};redraw();openSend()}else{say((r&&(r.why||r.line))||"That did not finalize.");if(r&&r.blockers)C.readiness={ready:false,blockers:r.blockers};footP()}},function(){footP()})})}
// ---------- Preview report: the PDF as the case stands ----------
function dlg(id,title){var scrim=el("div",{class:"scrim",id:id+"Scrim"});var d=el("div",{class:"dlg",id:id,role:"dialog","aria-modal":"true","aria-label":title});scrim.appendChild(d);scrim.addEventListener("click",function(e){if(e.target===scrim)scrim.remove()});document.addEventListener("keydown",function(e){if(e.key==="Escape")scrim.remove()});document.body.appendChild(scrim);return{scrim:scrim,d:d}}
function preview(){var x=dlg("pvDlg","Preview report");x.d.appendChild(el("p",{class:"mute",id:"pdfmsg",text:"Building the report from the case as it stands."}));
 clearTimeout(whyT);post({action:"case_pdf",id:D.active,draft:K.status!=="finalized",reportVersion:K.status!=="finalized"?4:undefined}).then(function(r){x.d.textContent="";
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
  var cf=r.confirm||{to:r.to||"",subject:r.subject||""},to=el("input",{class:"txt",id:"sendTo",type:"email",autocomplete:"off","aria-label":"To (the address the send is confirmed to)",placeholder:"seller@example.com",value:cf.to||""});x.d.appendChild(el("div",{class:"fld"},[el("span",{class:"rl",text:"To"}),to]));
  ro("Subject",r.subject,"sendSubject");ro("Message",r.message,"sendMsg");ro("Attachment",(r.attachmentName||"")+(r.version!=null?"  Version "+r.version:""),"sendAtt");
  var earlier=r.alreadySent||[];if(earlier.length){var ea=el("div",{class:"fld",id:"sendEarlierBox"},[el("span",{class:"rl",text:"Earlier sends"})]);earlier.forEach(function(e){ea.appendChild(el("div",{class:"ro",text:(e.to||"")+(e.version!=null?" Version "+e.version:"")}))});x.d.appendChild(ea)}
  var err=el("p",{class:"msg",id:"sendErr",role:"alert",hidden:""}),go=el("button",{type:"button",class:"btn pri",id:"sendGo",text:"Send"});if(!cf.to){go.disabled=true;err.textContent=r.toLine||"";err.hidden=!err.textContent}to.addEventListener("input",function(){if(sending)return;go.disabled=!to.value.trim();if(to.value.trim())err.hidden=true});var no=el("button",{type:"button",class:"btn",id:"sendNo",text:"Cancel"});x.d.appendChild(err);x.d.appendChild(el("div",{class:"btns"},[go,no]));
  no.addEventListener("click",function(){x.scrim.remove()});to.focus();
  go.addEventListener("click",function(){if(sending)return;sending=true;go.disabled=true;no.disabled=true;err.hidden=true;var body={action:"case_send",id:D.active,version:r.version!=null?r.version:K.version,to:to.value.trim(),confirm:{to:to.value.trim(),subject:cf.subject}};if(earlier.length)body.again=true;
   post(body).then(function(q){if(q&&q.ok){return(q.case?Promise.resolve(q.case):post({action:"case_get",id:D.active}).then(function(g2){return g2&&g2.case})).then(function(k){if(k){K=k;C.kase=k}sending=false;x.scrim.remove();redraw()})}sending=false;go.disabled=false;no.disabled=false;err.textContent=(q&&q.why)||"";err.hidden=!err.textContent},function(){sending=false;go.disabled=false;no.disabled=false})})})}
function rail(){var v=$("val");if(!v||v.firstChild)return;v.appendChild(el("h2",{class:"rtitle",id:"rtitle",text:"Recommendation"}));var rb=el("div",{class:"rb",id:"rb"});[["rcond",""],["rres","box cream"],["rlad",""],["rrange","box green"],["rwhy",""],["rneeds",""]].forEach(function(i){rb.appendChild(sect(i[0],i[1]))});v.appendChild(rb);v.appendChild(sect("rfoot","foot"))}
function railP(){condP();rangeP();reserveP();ladderP();whyP();needsP();footP()}
function redraw(){head();vehicle();words();small();market();closest();railP()}
rail();railP();
// ---------- the three step band: navigation only. The segment whose section is in view is dark green; a click scrolls to the section; no segment is ever disabled. ----------
(function(){var nav=$("steps");if(!nav)return;var segs=[].slice.call(nav.querySelectorAll(".st")),hold=0;
 function mark(k){segs.forEach(function(s){var on=s.getAttribute("data-step")===k;s.classList.toggle("on",on);if(on)s.setAttribute("aria-current","step");else s.removeAttribute("aria-current")})}
 function current(){var base=130,m=$("s-market"),end=window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-4&&window.scrollY>0;if(end)return"proposal";if(m&&m.getBoundingClientRect().top<=base+40)return"evidence";return"enquiry"}
 function onScroll(){if(Date.now()<hold)return;mark(current())}
 segs.forEach(function(s){s.addEventListener("click",function(){var k=s.getAttribute("data-step"),t=$(s.getAttribute("data-target"));mark(k);hold=Date.now()+900;if(t&&t.scrollIntoView)t.scrollIntoView({behavior:"smooth",block:"start"})})});
 window.addEventListener("scroll",onScroll,{passive:true});onScroll()})();
}
`;
