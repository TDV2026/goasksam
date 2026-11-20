// DEALER CARS AND CLASSIFIEDS ON FIND (Lane S, Nov 18 2026; crew only, behind FORSALE_PAGE_PUBLIC). The page side of Lane D's lane-d-forsale (16e1e48f): the engine answers Find with `forSale` beside `cards`:
//   forSale = { default: "auctions", counts: { all, auctions, dealers, classifieds }, dealers: G, classifieds: G, inventory }, G = { count, shown, remaining, cards: [C] },
//   C = { id, kind, typeWord ("Dealer" | "Classified"), name, asking, askingLine ("Asking $48,000"), miles, milesLine, location, url, host, image, read, readKind, historyLine, car, source }.
// THE PAGE PRINTS THEM AND DECIDES NOTHING (Rule: pages and emails compute nothing, everything comes from oneEngineAnswer): the four pills are counts.auctions, counts.dealers, counts.classifieds and counts.all, in the
// engine's words and numbers; each card prints typeWord, askingLine, name, milesLine, location, read and historyLine as sent, in the order sent; no sum, sort, filter, price or word of its own beyond the fixed pill names
// (Auctions, Dealers, Classifieds, All), the three headings (At auction now, At dealers, Classifieds), the button (View listing) and the line "Also for sale:" with its two link words.
// WHERE IT RUNS: api/buy.js is the one Find page, served as it is and wrapped in the new shell (lib/_newDesign.js capture), so both doors get it. The client script (public to every visitor) is not edited for a visitor: for the crew only, the served copy
// of it gets ONE added statement in drawSearch (block.__d = d, the engine's answer kept on the block it drew), and this module, a style and a script before it, reads block.__d.forSale and draws the pills, the groups and the line.
// EVERY ROAD: typed words, the car token, the chat, a rerun and a redrawn search ("Show them all", Back) all draw through drawSearch, so every one of them gets it; Show more (auctions) changes the auctions only; Dealers and Classifieds each have their own (the engine's countLine, shown of count, and its nextN), asked by buySearch action more with forSaleGroup and forSaleOffset.
// A VISITOR: forSaleHead() and forSaleClient() return their input, byte for byte, unless the request is crew (or the switch below is true).
export const FORSALE_PAGE_PUBLIC = false;   // THE ONE SWITCH. true gives the page to every visitor (the engine's own switch, FORSALE_PUBLIC, decides whether the answer carries forSale at all).
export const forSaleOn = crew => FORSALE_PAGE_PUBLIC === true || crew === true;

export const FORSALE_CSS = `.fs-pills{display:flex;flex-wrap:nowrap;gap:8px;margin:0 0 20px;overflow-x:auto;max-width:100%;scrollbar-width:none;-webkit-overflow-scrolling:touch}.fs-pills::-webkit-scrollbar{display:none}
.fs-pill{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 16px;border-radius:999px;border:1px solid var(--div);background:var(--card);color:var(--ink);font:500 14px/1 var(--sans);cursor:pointer;white-space:nowrap}
.fs-pill .fs-n{font-weight:400;opacity:.75}.fs-pill[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:#fff}.fs-pill[aria-disabled="true"]{opacity:.45;cursor:default}
.fs-also{margin:18px 0 0;font:400 14px/1.4 var(--sans);color:var(--sec)}.fs-also a{color:var(--green);text-decoration:underline;cursor:pointer}
.fs-h{margin:28px 0 14px;font:600 20px/1.3 var(--serif);color:var(--ink)}.fs-h .fs-hn{font:400 15px/1 var(--sans);color:var(--sec);margin-left:6px}
.fs-total{margin:0 0 14px;font:400 15px/1.4 var(--sans);color:var(--sec)}.fs-sec{margin:0}.fs-sec[hidden],.fs-h[hidden],.fs-also[hidden]{display:none}
.fs-m-dealers .grp,.fs-m-dealers .nonel,.fs-m-classifieds .grp,.fs-m-classifieds .nonel,.fs-m-all .nonel,.fs-m-auctions .fs-h-auc{display:none}
.fs-m-dealers .fs-h,.fs-m-classifieds .fs-h{display:none}
.fs-foot .fs-count{margin:14px 0 0;font:500 15px/1.4 var(--sans);color:var(--sec)}
.fs-car .sl .fs-hist{display:block;margin:10px 0 0;font:400 15px/1.4 var(--sans);color:var(--sec)}`;

export const FORSALE_JS = `(function(){var KEY="gas_fs_pill",NAMES={auctions:"Auctions",dealers:"Dealers",classifieds:"Classifieds",all:"All"},ORDER=["auctions","dealers","classifieds","all"];
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function href(u){return /^https?:\\/\\//i.test(String(u||""))?String(u):"#"}
function saved(){try{return localStorage.getItem(KEY)}catch(e){return null}}
function save(v){try{localStorage.setItem(KEY,v)}catch(e){}}
function count(fs,k){var c=fs&&fs.counts?Number(fs.counts[k]):0;return c>0?c:0}
function cardHtml(c,eager){var t=esc(c.typeWord),u=href(c.url),nm=esc(c.name),bits=[c.milesLine,c.location].filter(Boolean),arrow='<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 8.5l5-5M4.5 3.5h4v4"/></svg>',
 ph=c.image?'<a class="ph" href="'+esc(u)+'" target="_blank" rel="noopener" aria-label="Open the listing on '+esc(c.host)+'"><img src="'+esc(c.image)+'" alt="'+nm+'"'+(eager?'':' loading="lazy"')+' referrerpolicy="no-referrer" onerror="var c=this.closest(\\'.car\\');if(c)c.classList.add(\\'nophoto\\');var p=this.closest(\\'.ph\\');if(p)p.remove();"><span class="chips"><span class="chip">'+t+'</span></span><span class="mlab"><span class="mv">'+esc(c.askingLine)+'</span></span></a>':'';
 return '<article class="car fs-car'+(c.image?'':' nophoto')+'" data-fs-id="'+esc(c.id)+'">'+ph+'<div class="tx">'+(ph?'':'<p class="mlab"><span class="mv">'+esc(c.askingLine)+'</span></p>')+'<p class="src">'+esc([c.typeWord,c.host].filter(Boolean).join(" \\u00b7 "))+'</p><div class="trow"><h3><span class="ttl" title="'+nm+'">'+nm+'</span></h3></div>'+
 (bits.length?'<p class="meta">'+bits.map(function(b){return '<span class="nw">'+esc(b)+'</span>'}).join(' <span class="sep">\\u00b7</span> ')+'</p>':'<p class="meta"></p>')+
 '<div class="sl"><span class="who">Sam</span>'+esc(c.read)+(c.historyLine?'<span class="fs-hist">'+esc(c.historyLine)+'</span>':'')+'</div>'+
 '<div class="acts"><a class="vauc" href="'+esc(u)+'" target="_blank" rel="noopener">View listing '+arrow+'</a></div></div></article>'}
function gridHtml(g){var cs=g&&Array.isArray(g.cards)?g.cards:[];return cs.length?'<div class="cgrid n'+Math.min(cs.length,6)+'">'+cs.map(function(c,i){return cardHtml(c,i<6)}).join("")+'</div>':''}
function footHtml(g,k){var cl=g&&g.countLine?'<p class="fs-count" data-fs-count="'+k+'" role="status">'+esc(g.countLine)+'</p>':'',rem=g&&Number(g.remaining)>0;return cl+(rem?'<p class="morerow"><a href="#" data-fs-more="'+k+'">Show '+Number(g.nextN||0).toLocaleString("en-US")+' more</a></p>':'')}
function groupHtml(g,k){return gridHtml(g)+'<div class="fs-foot" data-fs-foot="'+k+'">'+footHtml(g,k)+'</div>'}
function sess(k){try{return sessionStorage.getItem(k)||""}catch(e){return ""}}
function more(blk,k,a){var d=blk.__d,g=d.forSale[k],z=sess("gas_buy_zip"),r=Number(sess("gas_buy_radius"));z=/^\\d{5}$/.test(z)?z:null;blk.__fsBusy=true;var old=a.textContent;a.textContent="Reading\\u2026";a.classList.add("busy");a.setAttribute("aria-busy","true");
 var foot=blk.querySelector('[data-fs-foot="'+k+'"]'),note=foot&&foot.querySelector(".morenote");if(note)note.remove();
 fetch("/api/buySearch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"more",filters:(d.state&&d.state.filters)||{},forSaleGroup:k,forSaleOffset:Number(g.shown)||0,zip:z,radius:r>0&&z?r:null})}).then(function(x){return x.json()}).catch(function(){return null}).then(function(j){
  blk.__fsBusy=false;a.classList.remove("busy");a.removeAttribute("aria-busy");var ng=j&&j.forSale&&j.forSale[k];
  if(!ng||!Array.isArray(ng.cards)||!ng.cards.length){a.textContent=old;if(foot)foot.insertAdjacentHTML("beforeend",'<p class="morenote" role="status">Could not load more just now. Press again.</p>');return}
  var sec=blk.querySelector('.fs-sec[data-fs="'+k+'"]'),have={};g.cards.forEach(function(c){have[c.id]=true});var nc=ng.cards.filter(function(c){return !have[c.id]});
  g.cards=g.cards.concat(nc);g.shown=ng.shown;g.remaining=ng.remaining;g.nextN=ng.nextN;g.countLine=ng.countLine;
  var grid=sec&&sec.querySelector(".cgrid");if(grid)grid.insertAdjacentHTML("beforeend",nc.map(function(c){return cardHtml(c,false)}).join(""));
  if(foot)foot.innerHTML=footHtml(g,k)})}
function usable(fs,k){return k==="auctions"||k==="all"||count(fs,k)>0}
function choose(fs){var s=saved();return ORDER.indexOf(s)>=0&&usable(fs,s)?s:(ORDER.indexOf(fs&&fs.default)>=0?fs.default:"auctions")}
function apply(block,k){var fs=block.__d.forSale;block.__fsSel=k;block.className=block.className.replace(/\\s*fs-m-\\w+/g,"")+" fs-m-"+k;
 var ps=block.querySelectorAll(".fs-pill");for(var i=0;i<ps.length;i++)ps[i].setAttribute("aria-pressed",ps[i].getAttribute("data-fs-pill")===k?"true":"false");
 var all=k==="all",dl=block.querySelector('.fs-sec[data-fs="dealers"]'),cl=block.querySelector('.fs-sec[data-fs="classifieds"]'),ah=block.querySelector(".fs-h-auc");
 if(dl)dl.hidden=!(all||k==="dealers");if(cl)cl.hidden=!(all||k==="classifieds");var al=block.querySelector(".fs-also");if(al)al.hidden=k!=="auctions"}
function decorate(block){var d=block.__d,fs=d&&d.forSale;if(!fs||block.__fsDone||!fs.counts)return;block.__fsDone=true;
 var grp=block.querySelector(".grp"),nonel=block.querySelector(".nonel"),keep=block.querySelector(".keepl"),first=grp||nonel||keep,wrap=document.createElement("div");wrap.className="fs-wrap";
 var nd=count(fs,"dealers"),nc=count(fs,"classifieds"),parts=[];if(nd)parts.push('<a data-fs-pill="dealers">'+nd.toLocaleString("en-US")+' at dealers</a>');if(nc)parts.push('<a data-fs-pill="classifieds">'+nc.toLocaleString("en-US")+' classifieds</a>');
 wrap.innerHTML=(parts.length?'<p class="fs-also">Also for sale: '+parts.join(", ")+'</p>':'')+
  '<section class="fs-sec" data-fs="dealers" hidden><h3 class="fs-h">At dealers<span class="fs-hn">'+nd.toLocaleString("en-US")+'</span></h3>'+groupHtml(fs.dealers,"dealers")+'</section>'+
  '<section class="fs-sec" data-fs="classifieds" hidden><h3 class="fs-h">Classifieds<span class="fs-hn">'+nc.toLocaleString("en-US")+'</span></h3>'+groupHtml(fs.classifieds,"classifieds")+'</section>';
 var pills=document.createElement("div");pills.className="fs-pills";pills.setAttribute("role","group");pills.setAttribute("aria-label","What is for sale");
 pills.innerHTML=ORDER.map(function(k){var n=count(fs,k),off=n===0;return '<button type="button" class="fs-pill" data-fs-pill="'+k+'" aria-pressed="false"'+(off?' aria-disabled="true"':'')+'>'+NAMES[k]+' <span class="fs-n">'+n.toLocaleString("en-US")+'</span></button>'}).join("");
 var hauc=document.createElement("h3");hauc.className="fs-h fs-h-auc";hauc.innerHTML='At auction now<span class="fs-hn">'+count(fs,"auctions").toLocaleString("en-US")+'</span>';
 var at=first||null;if(at){at.parentNode.insertBefore(pills,at);at.parentNode.insertBefore(hauc,at)}else{block.appendChild(pills);block.appendChild(hauc)}
 if(grp)grp.parentNode.insertBefore(wrap,grp.nextSibling);else if(nonel)nonel.parentNode.insertBefore(wrap,nonel);else if(keep)keep.parentNode.insertBefore(wrap,keep);else block.appendChild(wrap);
 apply(block,choose(fs))}
document.addEventListener("click",function(e){var m=e.target&&e.target.closest?e.target.closest("[data-fs-more]"):null;if(!m)return;e.preventDefault();var k=m.getAttribute("data-fs-more"),blk=m.closest(".results");if(!blk||!blk.__d||!blk.__d.forSale||!blk.__d.forSale[k]||blk.__fsBusy)return;more(blk,k,m)});
document.addEventListener("click",function(e){var b=e.target&&e.target.closest?e.target.closest("[data-fs-pill]"):null;if(!b)return;e.preventDefault();var k=b.getAttribute("data-fs-pill"),blk=b.closest(".results");if(!blk||!blk.__d||!blk.__d.forSale||!usable(blk.__d.forSale,k)||b.getAttribute("aria-disabled")==="true")return;save(k);apply(blk,k)});
function scan(){var bs=document.querySelectorAll(".msg.results");for(var i=0;i<bs.length;i++)if(bs[i].__d&&bs[i].getAttribute("data-done"))try{decorate(bs[i])}catch(e){}}
function watch(){try{new MutationObserver(scan).observe(document.body||document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["data-done"]})}catch(e){}scan()}
if(document.body)watch();else document.addEventListener("DOMContentLoaded",watch)})();`;

// the head part: a style and a script, crew only, once
export function forSaleHead(crew) {
  return forSaleOn(crew) ? `<style id="fs-css">${FORSALE_CSS}</style><script id="fs-mod">${FORSALE_JS}</script>` : "";
}
// the client script: crew only, the engine's answer kept on the block drawSearch makes. The anchor is asserted by the check; if Find's client changes it, the crew page keeps working without the groups (and the check fails).
export const FORSALE_ANCHOR = 'block.className = "msg sam results chatreply";';
// THE VEHICLE COUNT (crew only, behind FORSALE_PUBLIC; lib/forsale/total.js). The engine serves forSale.counts.total (rounded down to the thousand) and its two lines; the top of Find prints lines.top and the searching sign prints
// lines.searching, both as sent. No number is made here, rounded here or joined to a word here; with no count served (a visitor, a quiet table, under a thousand) both are left out and the page is what it was.
export const TOTAL_ANCHOR = 'var SEARCH_LINE = "Sam is searching {site} for your car";';
export const CYCLE_LIST = /var LIVE_SITES = \[[^\]]*\];/, CYCLE_TIMER = 'cycle(); var t = setInterval(cycle, SEARCH_LINE_MS);';
export function forSaleTop(crew, total) {
  const line = forSaleOn(crew) && total && total.lines && typeof total.lines.top === "string" ? total.lines.top : "";
  return line ? `<p class="fs-total" id="fs-total">${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")}</p>` : "";
}
export function forSaleClient(client, crew, total) {
  if (!forSaleOn(crew)) return client;
  let s = String(client);
  const said = total && total.lines && typeof total.lines.searching === "string" ? total.lines.searching : "";
  if (said && s.includes(TOTAL_ANCHOR) && s.indexOf(TOTAL_ANCHOR) === s.lastIndexOf(TOTAL_ANCHOR)) {
    s = s.replace(TOTAL_ANCHOR, () => 'var SEARCH_LINE = ' + JSON.stringify(said) + ';');
    // the count line is the whole message (Sam, Nov 19 2026): no site names beside it and no cycling. The list goes, and the timer that rewrote the line goes with it.
    s = s.replace(CYCLE_LIST, () => 'var LIVE_SITES = [];').replace(CYCLE_TIMER, () => 'cycle(); var t = 0;');
  }
  const i = s.indexOf(FORSALE_ANCHOR);
  return i < 0 || s.indexOf(FORSALE_ANCHOR, i + 1) >= 0 ? s : s.slice(0, i) + FORSALE_ANCHOR + " block.__d = d;" + s.slice(i + FORSALE_ANCHOR.length);
}
