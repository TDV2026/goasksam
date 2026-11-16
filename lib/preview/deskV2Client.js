// DESK V2 CLIENT (Lane S, Nov 15 2026): the browser half of lib/preview/deskV2.js. It draws what the server sent and computes nothing: no count, no sum, no sort of money.
import { DESK_V2_CASE_JS } from "./deskV2Case.js";
export const DESK_V2_JS = `(function(){
var D=window.__D2__,$=function(i){return document.getElementById(i)};
function post(b){return fetch(D.api,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}).then(function(r){return r.json()})}
function el(t,a,k){var e=document.createElement(t);for(var x in a||{}){if(x==="text")e.textContent=a[x];else e.setAttribute(x,a[x])}(k||[]).forEach(function(c){if(c)e.appendChild(c)});return e}
var searching=false,cards=$("cards"),none=$("none"),filter=D.filter;
function show(){var any=false;[].forEach.call(cards.children,function(c){var on=filter===null||c.getAttribute("data-status")===filter||c.hasAttribute("data-hit");c.hidden=!on;if(on)any=true;var pl=c.querySelector(".pill");if(pl)pl.hidden=filter!==null&&c.getAttribute("data-status")===filter});var fb=document.querySelector(".fl.on [data-count]"),ln=$("clabn");if(ln&&!searching)ln.textContent=filter===null?"":(fb?fb.textContent:"");none.hidden=any;[].forEach.call(document.querySelectorAll(".fl"),function(b){var on=filter!==null&&b.getAttribute("data-f")===filter;b.classList.toggle("on",on);b.setAttribute("aria-pressed",on?"true":"false")})}
document.getElementById("fls").addEventListener("click",function(e){var b=e.target.closest(".fl");if(!b)return;filter=b.getAttribute("data-f");[].forEach.call(cards.children,function(c){c.removeAttribute("data-hit")});$("qs").value="";show()});
cards.addEventListener("click",function(e){var b=e.target.closest("[data-claim]");if(!b)return;e.preventDefault();b.disabled=true;post({action:"case_claim",id:b.getAttribute("data-claim")}).then(function(r){if(r&&r.ok)location.href=D.caseBase+b.getAttribute("data-claim");else{b.disabled=false;b.textContent=(r&&r.why)||"Not claimed"}},function(){b.disabled=false})});
$("viewallc").addEventListener("click",function(){filter=null;[].forEach.call(cards.children,function(c){c.removeAttribute("data-hit")});$("qs").value="";show()});
var t=null,seq=0;
$("qs").addEventListener("input",function(){var v=this.value.trim();clearTimeout(t);t=setTimeout(function(){var my=++seq;[].forEach.call(cards.children,function(c){c.removeAttribute("data-hit")});if(!v){searching=false;show();return}searching=true;
post({action:"case_list",q:v,org:D.org||undefined}).then(function(r){if(my!==seq||!r||!r.ok)return;var ln=$("clabn");if(ln&&r.count!=null)ln.textContent=r.count;var ids={};(r.rows||[]).forEach(function(x){ids[x.id]=1});[].forEach.call(cards.children,function(c){if(ids[c.getAttribute("data-case")])c.setAttribute("data-hit","1")});show()},function(){})},180)});
show();
// The top bar: the initials in the circle open the seat menu (the served name and Change name). seat_name { name } sets the calling seat's own name; the bar prints what the door answers with.
var who=$("who"),wm=$("wmenu");
who.addEventListener("click",function(e){e.stopPropagation();var on=wm.hidden;wm.hidden=!on;who.setAttribute("aria-expanded",on?"true":"false")});
document.addEventListener("click",function(e){if(!wm.hidden&&!e.target.closest(".whow")){wm.hidden=true;who.setAttribute("aria-expanded","false")}});
$("whorename").addEventListener("click",function(){var nmEl=$("whoname"),cur=nmEl.textContent,inp=document.createElement("input");inp.type="text";inp.className="whoin";inp.value=cur;inp.maxLength=60;inp.setAttribute("aria-label","Your name");nmEl.hidden=true;nmEl.parentNode.insertBefore(inp,nmEl);inp.focus();inp.select();var done=false;
 function end(save){if(done)return;done=true;var v=inp.value.trim();inp.remove();nmEl.hidden=false;if(!save||!v||v===cur)return;post({action:"seat_name",name:v}).then(function(r){var st=r&&r.ok&&r.seat;if(st&&st.displayName){nmEl.textContent=st.displayName;who.title=st.displayName;if(st.initials)$("whoini").textContent=st.initials;wm.hidden=true}},function(){})}
 inp.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();end(true)}else if(e.key==="Escape"){end(false)}});inp.addEventListener("blur",function(){end(true)})});
`+DESK_V2_CASE_JS+`
})();`;
