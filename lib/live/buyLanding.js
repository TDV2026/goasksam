// The Buy landing (Lane C, Oct 2026, Sam's approved mock): the state before a first search. Server-rendered
// inside <div id="lead">, which the page's client removes on the first search (send()), so the chat and the
// results after a first search are exactly as before. Keeps the page's H1 ("Find a collector car at
// auction") and adds the dated "Updated" line as its lead sentence (search rule 1). The "A real example"
// band comes from lib/live/buyExample.js (the live Buy search + sold engine) and is hidden when weak.
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
const num = n => Math.round(Number(n)).toLocaleString("en-US");

const ICON = {
  chat: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5C9 5 4 9.4 4 14.8c0 3 1.6 5.6 4.1 7.4L7 27l5.2-2.9c1.2.3 2.5.5 3.8.5 7 0 12-4.4 12-9.8S23 5 16 5z"/></svg>',
  gavel: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M12.5 4.5l7 7M9 8l7 7M10.8 6.2l5.4-1.7 5.3 5.3-1.7 5.4M13.5 12.5L5 21l3 3 8.5-8.5M4 28h13"/></svg>',
  doc: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 4h16v24H8zM12 10h8M12 15h8M12 20h5"/></svg>',
  bell: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 21V14a7 7 0 0 1 14 0v7l2 3H7zM13.5 27a2.5 2.5 0 0 0 5 0M16 4v3"/></svg>',
  car: '<svg viewBox="0 0 120 40" aria-hidden="true"><path d="M8 30h104M14 30c0-5 3-8 8-9l12-9c3-2 7-3 11-3h20c5 0 9 2 12 5l8 7c8 1 14 4 15 9"/><circle cx="34" cy="31" r="5"/><circle cx="88" cy="31" r="5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>'
};
const EXAMPLES = ["manual 997 Carrera S under $70k", "anything air-cooled within 100 miles of 90210", "yellow Porsche"];

function photo(url, alt, cls) {
  return `<span class="${cls}">${url ? `<img src="${esc(url)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<span class="noph">No photo</span></span>`;
}
function carName(c) { return c.name || c.title || ""; }

// The sample notification: the example search's real first car when it fits the request in the first
// card (manual, under 60,000 miles); otherwise the same card with no figures.
function sampleCard(s) {
  const fits = s && /manual/i.test(String(s.gearbox || "")) && Number(s.miles) > 0 && Number(s.miles) < 60000;
  const facts = fits ? [`${num(s.miles)} miles`, "Manual"].join(" · ") : "Manual, under 60,000 miles";
  const where = fits ? [s.current_bid_usd ? `Bid ${usd(s.current_bid_usd)}` : "", s.location || ""].filter(Boolean).join(" · ") : "";
  const name = fits ? carName(s) : "Porsche 911 Carrera S";
  return `<div class="ls-step ls-found"><div class="ls-ex">An example</div>
    <div class="ls-fhead"><span class="ls-s" aria-hidden="true">S</span><div class="ls-ftxt"><b>Sam found one.</b><span>${esc(name)}</span><span>${esc(facts)}</span>${where ? `<span>${esc(where)}</span>` : ""}</div>${fits ? photo(s.photo_url, name, "ls-fph") : ""}</div>
    ${fits && s.url ? `<a class="ls-view" href="${esc(s.url)}" target="_blank" rel="noopener">View details</a>` : `<span class="ls-view" aria-hidden="true">View details</span>`}</div>`;
}

function exampleHtml(band) {
  if (!band || !band.cards || band.cards.length < 3 || !band.range) return "";
  const r = band.range, fam = String(r.family || "").replace(/^./, c => c.toUpperCase());
  const line = `${fam} sold for ${usd(r.low)} to ${usd(r.high)} in ${r.window || "the last 12 months"}${r.count ? `, across ${num(r.count)} sales` : ""}.`;
  const cards = band.cards.map(c => {
    const name = carName(c);
    const facts = [c.gearbox ? String(c.gearbox).replace(/^./, x => x.toUpperCase()) : "", c.miles ? `${num(c.miles)} miles` : ""].filter(Boolean).join(" · ");
    return `<a class="lx-card" href="${esc(c.url || "#")}" target="_blank" rel="noopener">${photo(c.photo_url, name, "lx-ph")}
      <span class="lx-body"><span class="lx-name">${esc(name)}</span>${facts ? `<span class="lx-facts">${esc(facts)}</span>` : ""}
      ${c.current_bid_usd ? `<span class="lx-price">Bid ${usd(c.current_bid_usd)}</span>` : ""}${c.location ? `<span class="lx-loc">${esc(c.location)}</span>` : ""}</span>
      <span class="lx-go" aria-hidden="true">${ICON.arrow}</span></a>`;
  }).join("");
  const past = (band.recent || []).length ? `<div class="lx-past"><div class="lx-ph-h">Past sales of similar cars</div><div class="lx-prow">${band.recent.map(s =>
    `<a class="lx-sale" href="${esc(s.url || "#")}" target="_blank" rel="noopener">${photo(s.photo, s.title, "lx-sph")}<span class="lx-stxt"><span>${esc(s.title)}</span>${s.miles ? `<span>${num(s.miles)} miles</span>` : ""}<b>${usd(s.price)}</b></span></a>`).join("")}</div></div>` : "";
  return `<section class="lx" aria-label="A real example"><div class="lk-eyebrow">An example</div>
    <div class="lx-turn"><span class="lx-av lx-you" aria-hidden="true"></span><b>You</b><span class="lx-bub">${esc(band.query)}</span></div>
    <div class="lx-turn"><span class="lx-av lx-sam" aria-hidden="true">S</span><b>Sam</b><span class="lx-bub">Here are the live ones that fit, with what similar cars have sold for.</span></div>
    <p class="lx-range">${esc(line)}</p>
    <div class="lx-cards">${cards}</div>${past}</section>`;
}

export function landingHtml({ updated, band }) {
  const chips = EXAMPLES.map(x => `<button type="button" class="lk-chip" data-send="${esc(x)}">${esc(x)}</button>`).join("");
  const feats = [
    ["chat", "Ask in plain English", "Say what you want the way you’d say it to a friend. Sam finds every live car that fits."],
    ["gavel", "See what they really sold for", "Every search comes with finished sales of similar cars. Real sales only. Nothing estimated."],
    ["doc", "Know the car’s history", "Past listings and sales of the exact car, when Sam has them."],
    ["bell", "Put Sam on it, free", "Not there today? Tell Sam what you want and he keeps searching. When the right car goes live, you get notified."]
  ].map(([i, h, p]) => `<div class="lk-feat"><span class="lk-ic">${ICON[i]}</span><h2>${h}</h2><p>${p}</p></div>`).join("");
  return `<div id="lead" class="lk">
  <section class="lk-hero">
    <div class="lk-heroin">
      <h1 class="lk-h1">Find a collector car at auction</h1>
      <p class="lk-upd" data-lead-sentence>Live collector cars.${updated ? ` Updated ${esc(updated)}.` : ""}</p>
      <p class="lk-display">Tell Sam what you’re looking for.</p>
      <p class="lk-sub">Type it or say it. Sam finds every live collector car that fits, shows what similar cars really sold for, and keeps looking after you leave.</p>
      <div class="lk-search" role="search"><label for="hq" class="lk-sr">What are you looking for?</label><input id="hq" autocomplete="off" enterkeyhint="search" placeholder="Type it or say it: what are you looking for?"><button type="button" class="lk-mic" id="hmic" aria-label="Speak instead of typing" aria-pressed="false">${ICON.mic}</button><button type="button" class="lk-go" id="hgo" aria-label="Search">${ICON.arrow}</button></div>
      <div class="lk-chips">${chips}</div>
    </div>
  </section>
  <section class="lk-more"><h2 class="lk-h2">More than a list of cars.</h2><div class="lk-feats">${feats}</div></section>
  <section class="ls" aria-label="Put Sam on it"><div class="lk-eyebrow">Put Sam on it</div>
    <h2 class="ls-h">Sam keeps searching while you get on with your day.</h2>
    <p class="ls-p">Tell Sam what you want, once. He searches in the background, day and night, and checks every new listing. If you set a mileage limit, cars that don’t state their mileage are skipped. You get notified when one fits. Free. Pause or stop any time.</p>
    <div class="ls-steps">
      <div class="ls-step ls-tell"><div class="ls-st">You tell Sam once</div><div class="ls-msg"><span>A manual 997 Carrera S, under 60,000 miles.</span><span class="ls-send" aria-hidden="true">${ICON.arrow}</span></div></div>
      <div class="ls-mid"><span class="ls-cars" aria-hidden="true">${ICON.car}${ICON.car}${ICON.car}</span><span class="ls-dot" aria-hidden="true"><i></i></span><span class="ls-mtxt">Sam is searching in the background, day and night.</span></div>
      ${sampleCard(band && band.sample)}
    </div>
  </section>
  ${exampleHtml(band)}
  <p class="lk-foot">Real sales only. Nothing estimated.</p>
</div>`;
}

export const LANDING_CSS = `
.lk{width:100%;max-width:1060px;margin:0 auto;padding:8px 0 32px}
.lk h1,.lk h2{margin:0}
.lk-hero{border-bottom:1px solid var(--div);padding:8px 0 34px;background:linear-gradient(100deg,var(--page) 55%,#EDE7DA 100%);border-radius:0 0 18px 18px}
.lk-heroin{max-width:620px}
.lk-h1{font:500 13px/1.4 var(--sans);color:var(--sec);letter-spacing:.01em}
.lk-upd{font:400 13px/1.4 var(--sans);color:var(--sec);margin:2px 0 14px}
.lk-display{font:500 clamp(38px,5.6vw,60px)/1.04 var(--serif);color:var(--ink);letter-spacing:-.015em;margin:0 0 16px}
.lk-sub{font:400 18px/1.5 var(--sans);color:var(--soft);margin:0 0 22px;max-width:52ch}
.lk-search{display:flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:6px 6px 6px 18px;box-shadow:0 10px 30px -22px rgba(21,32,26,.5)}
.lk-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:400 17px/1.4 var(--sans);color:var(--ink);padding:10px 0}
.lk-search input::placeholder{color:var(--sec)}
.lk-mic,.lk-go{width:44px;height:44px;flex:none;border:0;border-radius:10px;display:grid;place-items:center;cursor:pointer;background:transparent;color:var(--sec)}
.lk-mic svg{width:19px;height:19px;fill:currentColor}.lk-mic.on{color:var(--green)}
.lk-go{background:var(--green);color:#fff}.lk-go svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2}
.lk-sr{position:absolute;left:-9999px}
.lk-chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
.lk-chip{border:1px solid var(--div);background:#FBF8F2;border-radius:999px;padding:9px 14px;font:400 14px/1.2 var(--sans);color:var(--soft);cursor:pointer;min-height:40px}
.lk-chip:hover{border-color:var(--green);color:var(--green)}
.lk-more{padding:38px 0 30px}
.lk-h2{font:500 clamp(30px,3.6vw,40px)/1.1 var(--serif);color:var(--ink);margin-bottom:26px!important}
.lk-feats{display:grid;grid-template-columns:repeat(4,1fr)}
.lk-feat{padding:0 22px;border-left:1px solid var(--div)}.lk-feat:first-child{padding-left:0;border-left:0}
.lk-ic svg{width:32px;height:32px;fill:none;stroke:var(--ink);stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round}
.lk-feat h2{font:500 19px/1.25 var(--serif);color:var(--ink);margin:14px 0 8px}
.lk-feat p{font:400 14.5px/1.55 var(--sans);color:var(--sec);margin:0}
.lk-eyebrow{font:600 12px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--sec);margin-bottom:12px}
.ls{background:#E9EDE6;border-radius:18px;padding:30px 34px 34px}
.ls-h{font:500 clamp(26px,3.2vw,34px)/1.15 var(--serif);color:var(--ink)}
.ls-p{font:400 16px/1.6 var(--sans);color:var(--soft);margin:12px 0 24px;max-width:78ch}
.ls-steps{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;align-items:center}
.ls-step{background:var(--card);border:1px solid var(--div);border-radius:14px;padding:16px 18px}
.ls-st{font:500 15px/1.3 var(--sans);color:var(--ink);margin-bottom:12px}
.ls-msg{display:flex;align-items:center;gap:12px;justify-content:space-between;background:#FBF8F2;border:1px solid var(--div);border-radius:10px;padding:12px 12px 12px 14px;font:400 15px/1.45 var(--sans);color:var(--ink)}
.ls-send{width:30px;height:30px;flex:none;border-radius:50%;background:var(--green);display:grid;place-items:center}
.ls-send svg,.lx-go svg{width:16px;height:16px;fill:none;stroke:#fff;stroke-width:2.2}
.ls-mid{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px}
.ls-cars{display:flex;gap:8px;opacity:.35}.ls-cars svg{width:70px;height:24px;fill:none;stroke:var(--sec);stroke-width:2}
.ls-dot{width:38px;height:38px;border-radius:50%;background:rgba(30,77,56,.12);display:grid;place-items:center}.ls-dot i{width:10px;height:10px;border-radius:50%;background:var(--green)}
.ls-mtxt{font:500 15px/1.4 var(--sans);color:var(--ink);max-width:24ch}
.ls-ex{font:400 12px/1 var(--sans);color:var(--sec);margin-bottom:10px}
.ls-fhead{display:flex;gap:12px;align-items:flex-start}
.ls-s,.lx-sam{width:28px;height:28px;flex:none;border-radius:50%;background:var(--green);color:#fff;display:grid;place-items:center;font:600 14px/1 var(--serif)}
.ls-ftxt{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0;font:400 13px/1.35 var(--sans);color:var(--sec)}.ls-ftxt b{font:600 15px/1.3 var(--sans);color:var(--ink)}
.ls-fph{position:relative;width:72px;height:52px;flex:none;border-radius:8px;overflow:hidden;background:var(--ph)}
.ls-view{display:block;margin-top:14px;text-align:center;background:var(--green);color:#fff;border-radius:10px;padding:11px;font:600 14px/1 var(--sans);text-decoration:none}
.noph{position:absolute;inset:0;display:grid;place-items:center;font:600 10px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--sec)}
.ls-fph img,.lx-ph img,.lx-sph img{position:relative;z-index:1;width:100%;height:100%;object-fit:cover;display:block}
.lx{padding:34px 0 8px}
.lx-turn{display:flex;align-items:center;gap:12px;margin:0 0 12px;font:400 15px/1.4 var(--sans);color:var(--ink)}.lx-turn b{font-weight:600;min-width:34px}
.lx-av{width:34px;height:34px;flex:none;border-radius:50%}.lx-you{background:var(--ph)}
.lx-bub{background:#EFEBE2;border-radius:10px;padding:9px 14px}
.lx-range{font:500 18px/1.45 var(--serif);color:var(--ink);margin:18px 0 14px}
.lx-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.lx-card{position:relative;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--div);border-radius:14px;overflow:hidden;color:var(--ink);text-decoration:none}
.lx-ph{position:relative;display:block;aspect-ratio:16/9;background:var(--ph);margin:10px 10px 0;border-radius:10px;overflow:hidden}
.lx-body{display:flex;flex-direction:column;gap:4px;padding:12px 56px 16px 16px}
.lx-name{font:600 16px/1.3 var(--sans)}.lx-facts,.lx-loc{font:400 14px/1.3 var(--sans);color:var(--sec)}
.lx-price{font:600 19px/1.3 var(--sans);margin-top:6px}
.lx-go{position:absolute;right:14px;bottom:18px;width:34px;height:34px;border-radius:50%;border:1px solid var(--div);display:grid;place-items:center}.lx-go svg{stroke:var(--ink)}
.lx-past{margin-top:16px;background:#EFEBE2;border-radius:14px;padding:14px 16px}
.lx-ph-h{font:500 14px/1 var(--sans);color:var(--ink);margin-bottom:12px}
.lx-prow{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.lx-sale{display:flex;gap:12px;align-items:center;color:var(--ink);text-decoration:none}
.lx-sph{position:relative;width:72px;height:50px;flex:none;border-radius:8px;overflow:hidden;background:var(--ph)}
.lx-stxt{display:flex;flex-direction:column;gap:2px;font:400 13px/1.3 var(--sans);color:var(--sec);min-width:0}.lx-stxt span:first-child{color:var(--ink)}.lx-stxt b{color:var(--ink);font-weight:600}
.lk-foot{text-align:center;font:400 13px/1.4 var(--sans);color:var(--sec);border-top:1px solid var(--div);padding-top:18px;margin:34px 0 0}
body:has(#lead) .composer{display:none}
body:has(#lead) .scroll .col{margin-top:0}
@media (max-width:860px){.lk-feats{grid-template-columns:1fr 1fr;row-gap:26px}.lk-feat:nth-child(3){padding-left:0;border-left:0}.ls-steps{grid-template-columns:1fr}.ls-mid{padding:6px 0}.lx-cards,.lx-prow{grid-template-columns:1fr}}
@media (max-width:520px){.lk-feats{grid-template-columns:1fr}.lk-feat{padding:0;border-left:0}.ls{padding:22px 18px 24px;border-radius:14px}.lk-sub{font-size:17px}.lk-chip{font-size:13.5px}}
`;
