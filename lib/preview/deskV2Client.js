// DESK V2 CLIENT (Lane S, Nov 15 2026): the browser half of lib/preview/deskV2.js. It draws what the server sent and computes nothing: no count, no sum, no sort of money.
import { DESK_V2_CASE_JS } from "./deskV2Case.js";
export const DESK_V2_JS = `(function(){
var D=window.__D2__,$=function(i){return document.getElementById(i)};
function post(b){return fetch(D.api,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}).then(function(r){return r.json()})}
function el(t,a,k){var e=document.createElement(t);for(var x in a||{}){if(x==="text")e.textContent=a[x];else e.setAttribute(x,a[x])}(k||[]).forEach(function(c){if(c)e.appendChild(c)});return e}
var cards=$("cards"),none=$("none"),filter=D.filter;
function show(){var any=false;[].forEach.call(cards.children,function(c){var on=c.getAttribute("data-status")===filter||c.hasAttribute("data-hit");c.hidden=!on;if(on)any=true;var pl=c.querySelector(".pill");if(pl)pl.hidden=c.getAttribute("data-status")===filter});none.hidden=any;[].forEach.call(document.querySelectorAll(".fl"),function(b){var on=b.getAttribute("data-f")===filter;b.classList.toggle("on",on);b.setAttribute("aria-pressed",on?"true":"false")})}
document.getElementById("fls").addEventListener("click",function(e){var b=e.target.closest(".fl");if(!b)return;filter=b.getAttribute("data-f");[].forEach.call(cards.children,function(c){c.removeAttribute("data-hit")});$("qs").value="";show()});
cards.addEventListener("click",function(e){var b=e.target.closest("[data-claim]");if(!b)return;e.preventDefault();b.disabled=true;post({action:"case_get",id:b.getAttribute("data-claim"),open:true}).then(function(r){if(r&&r.ok)location.href=D.caseBase+b.getAttribute("data-claim");else{b.disabled=false;b.textContent=(r&&r.why)||"Not claimed"}},function(){b.disabled=false})});
var t=null,seq=0;
$("qs").addEventListener("input",function(){var v=this.value.trim();clearTimeout(t);t=setTimeout(function(){var my=++seq;[].forEach.call(cards.children,function(c){c.removeAttribute("data-hit")});if(!v){show();return}
post({action:"case_list",q:v}).then(function(r){if(my!==seq||!r||!r.ok)return;var ids={};(r.rows||[]).forEach(function(x){ids[x.id]=1});[].forEach.call(cards.children,function(c){if(ids[c.getAttribute("data-case")])c.setAttribute("data-hit","1")});show()},function(){})},180)});
show();
`+DESK_V2_CASE_JS+`
})();`;
