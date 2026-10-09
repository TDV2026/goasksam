// The Buy landing (Lane C, Oct 2026, Sam's approved mock): the state before a first search. Server-rendered
// inside <div id="lead">, which the page's client removes on the first search (send()), so the chat and the
// results after a first search are exactly as before. Keeps the page's H1 ("Find a collector car at
// auction") and the dated "Updated" line as its lead sentence (search rule 1). The hero is the shared one
// (lib/heroImage.js). The example band, the example chips and the sample notification come from
// lib/live/buyExample.js (the live Buy search + sold engine) and are hidden when there is nothing real.
import { heroHtml, HERO_CSS } from "../heroImage.js";
import { featureCardsHtml, FEATURE_CARDS_CSS } from "../featureCards.js";
import { TASK_CANDIDATES } from "./buyExample.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
const num = n => Math.round(Number(n)).toLocaleString("en-US");
const cap = s => String(s || "").replace(/^./, c => c.toUpperCase());

const ICON = {
  chat: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5C9 5 4 9.4 4 14.8c0 3 1.6 5.6 4.1 7.4L7 27l5.2-2.9c1.2.3 2.5.5 3.8.5 7 0 12-4.4 12-9.8S23 5 16 5z"/></svg>',
  gavel: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M14 4.5l8 8M10.5 8l8 8M12.2 6.2l4.3-1.8 6.6 6.6-1.8 4.3M14.5 13.5L5.5 22.5l3.5 3.5 9-9M4 28.5h14"/></svg>',
  doc: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8.5 4.5h15v23h-15zM12.5 10.5h7M12.5 15h7M12.5 19.5h4.5"/></svg>',
  bell: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9.5 21.5V14a6.5 6.5 0 0 1 13 0v7.5l2 3h-17zM13.5 27.5a2.5 2.5 0 0 0 5 0M16 4.5v3"/></svg>',
  car: '<svg viewBox="0 0 120 40" aria-hidden="true"><path d="M8 30h104M14 30c0-5 3-8 8-9l12-9c3-2 7-3 11-3h20c5 0 9 2 12 5l8 7c8 1 14 4 15 9"/><circle cx="34" cy="31" r="5"/><circle cx="88" cy="31" r="5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  person: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="12" r="5.5"/><path d="M6 28c1.5-5.5 5.4-8 10-8s8.5 2.5 10 8"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>'
};

function photo(url, alt, cls) {
  return `<span class="${cls}">${url ? `<img src="${esc(url)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<span class="noph">No photo</span></span>`;
}
function carName(c) { return c.name || c.title || ""; }

// The panel's match card: the task's real live car (its own miles and gearbox, its bid only when the
// listing carried one at build time), or no card at all. An example only: nothing on it is clickable.
function sampleCard(s) {
  if (!s) return "";
  const name = carName(s);
  const facts = [s.miles ? `${num(s.miles)} miles` : s.km ? `${num(s.km)} km` : "", s.gearbox ? cap(s.gearbox) : ""].filter(Boolean).join(" · ");
  const where = [s.current_bid_usd ? `Bid ${usd(s.current_bid_usd)}` : "", s.location || ""].filter(Boolean).join(" · ");
  return `<div class="ls-step ls-found"><div class="ls-lab">A match appears</div><div class="ls-ex">An example</div>
    <div class="ls-fhead"><span class="ls-s" aria-hidden="true">S</span><div class="ls-ftxt"><b>Sam found one.</b><span>${esc(name)}</span>${facts ? `<span>${esc(facts)}</span>` : ""}${where ? `<span>${esc(where)}</span>` : ""}</div>${photo(s.photo_url, name, "ls-fph")}</div></div>`;
}

// "This exact car sold before": the card's own latest earlier appearance (VIN matched, from the nightly
// build), or nothing at all.
function sameCarLine(c) {
  const a = (c.timeline || []).filter(x => x && x.date).slice(-1)[0]; if (!a) return "";
  return `<span class="lx-same">This exact car sold before →</span>`;
}
function exampleHtml(ex) {
  if (!ex || !ex.cards || ex.cards.length < 3 || !ex.range) return "";
  // Filters the sold range does not apply, as one plain sentence ("Sold prices are for any mileage, sold anywhere.").
  const r = ex.range, na = (r.notApplied || []).length ? ` Sold prices are for ${r.notApplied.join(", ")}.` : "";
  // The engine's range is the FIRST car's own group (its exact spec), which can be narrower than the search,
  // so the line says whose group it is; filters the range does not apply are named in brackets. The range
  // is the engine's cluster, the middle half of that group's sales (Market Check's "Most sales landed
  // here"), so it reads "Most ... sold for", never as the full spread: the strip below shows sales from the
  // SAME pool and window (the engine's own cards), which can sit outside the middle half.
  const line = `Most ${r.family} like the first car sold for ${usd(r.low)} to ${usd(r.high)} in ${r.window || "the past year"}${r.count ? `, across ${num(r.count)} sales` : ""}.${na}`;
  const cards = ex.cards.map(c => {
    const name = carName(c);
    const facts = [c.gearbox ? cap(c.gearbox) : "", c.miles ? `${num(c.miles)} miles` : c.km ? `${num(c.km)} km` : ""].filter(Boolean).join(" · ");
    return `<a class="lx-card" href="${esc(c.url || "#")}" target="_blank" rel="noopener">${photo(c.photo_url, name, "lx-ph")}
      <span class="lx-body"><span class="lx-name">${esc(name)}</span>${facts ? `<span class="lx-facts">${esc(facts)}</span>` : ""}
      ${c.current_bid_usd ? `<span class="lx-price">Bid ${usd(c.current_bid_usd)}</span>` : ""}${c.location ? `<span class="lx-loc">${esc(c.location)}</span>` : ""}${sameCarLine(c)}</span>
      <span class="lx-go" aria-hidden="true">${ICON.arrow}</span></a>`;
  }).join("");
  const past = (ex.recent || []).length ? `<div class="lx-past"><div class="lx-ph-h">What similar cars sold for</div><div class="lx-prow">${ex.recent.map(s =>
    `<a class="lx-sale" href="${esc(s.url || "#")}" target="_blank" rel="noopener">${photo(s.photo, s.title, "lx-sph")}<span class="lx-stxt"><span>${esc(s.title)}</span>${s.miles ? `<span>${num(s.miles)} miles</span>` : ""}<b>${usd(s.price)}</b></span></a>`).join("")}</div></div>` : "";
  return `<section class="lx" aria-label="A real example"><div class="lk-eyebrow">One search. The market around the car.</div>
    <div class="lx-turn"><span class="lx-av lx-you" aria-hidden="true">${ICON.person}</span><b>You</b><span class="lx-bub">${esc(ex.query)}</span></div>
    <div class="lx-turn"><span class="lx-av lx-sam" aria-hidden="true">S</span><b>Sam</b><span class="lx-bub">Here are the live cars that fit, plus what similar cars actually sold for.</span></div>
    <div class="lx-in"><p class="lx-range">${esc(line)}</p><div class="lx-cards">${cards}</div>${past}</div></section>`;
}

export const PLACEHOLDERS = [
  "Find me a Porsche 911 under $100k",
  "Show me manual Ferrari 575Ms",
  "Black BMW M3 with less than 50,000 miles",
  "What's live near Chicago under $40k",
  "1967 Ford Mustang Fastback",
  "A Corvette Z06 from 2015 to 2019 ending this week",
  "Air-cooled 911 Targa",
  "Show me cheap Miatas"
];
// band: { chips: [query...], example: {...} | null } from lib/live/buyExample.js, or null/undefined.
export function landingHtml({ updated, band }) {
  const ex = band && band.example;
  // The panel's task: the first candidate with a live car (lib/live/buyExample.js), its car the match card
  // while that auction still has time left; with no task, the first candidate's sentence and no match card.
  const task = band && band.task;
  const taskText = (task && task.query) || TASK_CANDIDATES[0].q;
  const match = task && task.card && Date.parse(task.card.end_time) > Date.now() ? task.card : null;
  // The rotating placeholder: example searches the nightly build confirmed have live cars (lib/live/
  // buyExample.js chips); the client rotates them only until the visitor focuses the field.
  // Said the way a person would say it: "a Ford Mustang Fastback", "an Audi R8".
  // Sam's list (Oct 2026), in this order: conversation, commands and plain car names mixed. Every line was run
  // through the live search before shipping (docs/lane-notes.md). The box opens on the first; it rotates
  // only until the visitor focuses it, and never under reduced motion.
  const rotate = PLACEHOLDERS;
  const chips = ((band && band.chips) || []).map(x => `<button type="button" class="lk-chip" data-send="${esc(x)}">${esc(x)}</button>`).join("");
  const feats = [
    ["chat", "See everything live", "Search the market in plain English", "One search across the live collector-car auctions that matter."],
    ["gavel", "Understand the car", "Know what the bid means", "Real sold cars sit alongside what’s live, so the current bid is never just a number."],
    ["bell", "Keep looking", "Stop searching when you leave", "Tell Sam what you want once. It keeps watching and notifies you when a matching car goes live."]
  ].map(([i, e, h, p]) => ({ icon: ICON[i], eyebrow: e, title: h, body: p }));
  const heroInner = `
      <p class="lk-eyebrow lk-heye">Stop opening ten tabs.</p>
      <h1 class="lk-display">One search. Every live collector car auction.</h1>
      <p class="lk-sub">Live auctions, what similar cars sold for, and each car’s history, in one place.</p>
      <div class="lk-search" role="search"><label for="hq" class="lk-sr">What are you looking for?</label><input id="hq" autocomplete="off" enterkeyhint="search" placeholder="${esc(rotate[0])}" data-ph="${esc(JSON.stringify(rotate))}"><button type="button" class="lk-mic" id="hmic" aria-label="Speak instead of typing" aria-pressed="false">${ICON.mic}<span class="lk-mict">Speak</span></button><button type="button" class="sendbtn" id="hgo" aria-label="Search">${ICON.arrow}</button></div>
      ${chips ? `<div class="lk-chips">${chips}</div>` : ""}
      <p class="lk-upd lk-upd2" data-lead-sentence>Free · No account needed${updated ? ` · Updated ${esc(updated)}` : ""}.</p>`;
  return `<div id="lead" class="lk">
  ${heroHtml(heroInner)}
  <section class="lk-more"><h2 class="lk-h2">Not another auction site. The place you search all of them.</h2>${featureCardsHtml(feats, { headingTag: "h2" })}</section>
  <section class="ls" aria-label="Put Sam on it"><div class="lk-eyebrow">Put Sam on it</div>
    <h2 class="ls-h">Close the tabs. Sam keeps working.</h2>
    <p class="ls-p"><span>Alerts tell you what happened. Tasks work until something does.</span><span>Describe the exact car, in your own words. Sam keeps checking the market, day and night, and tells you when one fits.</span></p>
    <div class="ls-steps${match ? "" : " ls-two"}">
      <div class="ls-step ls-tell"><div class="ls-lab">You give Sam the task</div><div class="ls-msg"><span>${esc(taskText)}</span><span class="ls-send" aria-hidden="true">${ICON.arrow}</span></div></div>
      <span class="ls-dots" aria-hidden="true"></span>
      <div class="ls-mid"><span class="ls-cars" aria-hidden="true">${ICON.car}${ICON.car}${ICON.car}</span><span class="ls-dot" aria-hidden="true"><i></i></span><span class="ls-lab">Sam keeps working</span><span class="ls-mtxt">Nothing to refresh. Nothing to bookmark.</span></div>
      ${match ? `<span class="ls-dots" aria-hidden="true"></span>${sampleCard(match)}` : ""}
    </div>
    <div class="ls-act"><a class="kl-btn" data-keep-landing href="/tasks/mine?start=1">Have Sam keep looking</a><p class="ls-note">You’ll be notified when a matching car goes live.</p></div>
  </section>
  ${exampleHtml(ex)}
  <p class="lk-foot">Live auctions in one place. Real sales behind every answer. Built by the team behind <a href="https://thedailyvroom.com" target="_blank" rel="noopener">The Daily Vroom</a>.</p>
</div>`;
}

const CSS = `
.lk{width:100%;max-width:1080px;margin:0 auto;padding:0 0 28px}
.lk h1,.lk h2{margin:0}
.gas-hero{padding:34px 0 34px;border-bottom:1px solid var(--div)}
.gas-hero-in{max-width:640px}
.lk-h1{font:500 12.5px/1.4 var(--sans);color:var(--sec)}
.lk-upd{font:400 12.5px/1.4 var(--sans);color:var(--sec);margin:0 0 18px}
.lk-cred{margin:18px 0 0;font:400 13.5px/1.5 var(--sans);color:var(--sec)}
.lk-cred a{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
.lx-same{font:italic 400 14px/1.35 var(--serif);color:var(--ink);margin-top:2px}
.lk-display{font:500 clamp(44px,5.2vw,66px)/1.02 var(--serif);color:var(--ink);letter-spacing:-.02em;margin:0 0 16px;max-width:12.5em}
.lk-heye{margin:0 0 12px}
.lk-upd2{margin:14px 0 0}
.ls-lab{display:block;font:600 11.5px/1.2 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--sec);margin:0 0 10px}
.ls-act{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:20px 0 0}
.ls-act .kl-btn,.ls-act .kl-btn:hover{color:#fff;text-decoration:none}
.ls-note{margin:0;font:400 12.5px/1.4 var(--sans);color:var(--sec)}
.lk-sub{font:400 17px/1.55 var(--sans);color:var(--soft);margin:0 0 22px;max-width:38em}
.lk-search{display:flex;align-items:center;gap:8px;max-width:none;width:100%;min-height:64px;box-sizing:border-box;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:4px 6px 4px 18px;box-shadow:0 8px 24px -20px rgba(21,32,26,.45)}
.lk-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:400 15.5px/1.4 var(--sans);color:var(--ink);padding:11px 0}
.lk-search input::placeholder{color:var(--sec)}
.lk-mic{height:44px;flex:none;border:1px solid var(--div);border-radius:999px;display:inline-flex;align-items:center;gap:6px;padding:0 14px;cursor:pointer;background:var(--card);color:var(--ink);font:500 14px/1 var(--sans)}
.lk-mic:hover{border-color:var(--green)}
.lk-mict{display:inline}
.lk-search{padding:8px 10px 8px 22px;border-radius:14px}
.lk-search input{font-size:17px}
.lk-search .sendbtn{width:46px;height:46px}
.lk-mic svg{width:18px;height:18px;fill:currentColor}.lk-mic.on{color:var(--green)}
.lk-sr{position:absolute;left:-9999px}
.lk-chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;width:max-content;max-width:calc(100vw - 340px)}
.lk-chip{border:1px solid var(--div);background:rgba(251,248,242,.92);border-radius:999px;padding:8px 14px;font:400 13px/1.2 var(--sans);color:var(--soft);cursor:pointer;min-height:36px}
.lk-chip:hover{border-color:var(--green);color:var(--green)}
.lk-more{padding:48px 0 44px}
.lk-h2{font:500 clamp(30px,3.4vw,38px)/1.1 var(--serif);color:var(--ink);letter-spacing:-.01em;margin-bottom:26px!important}
.lk-eyebrow{font:600 11.5px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--sec);margin-bottom:12px}
.ls{background:#E7EBE4;border-radius:16px;padding:30px 36px 34px}
.ls-h{font:500 clamp(26px,3vw,32px)/1.15 var(--serif);color:var(--ink);letter-spacing:-.01em}
.ls-p{font:400 15.5px/1.6 var(--sans);color:var(--soft);margin:10px 0 26px;max-width:76ch}
.ls-p span{display:block}
.ls-steps{display:grid;grid-template-columns:1fr 64px 1fr 64px 1fr;align-items:center}
.ls-steps.ls-two{grid-template-columns:1fr 64px 1fr}
.ls-dots{height:2px;background-image:radial-gradient(circle,var(--sec) 1px,transparent 1.5px);background-size:10px 2px;background-repeat:repeat-x;opacity:.55;margin:0 8px}
.ls-step{background:var(--card);border:1px solid var(--div);border-radius:12px;padding:16px 18px}
.ls-msg{display:flex;align-items:center;gap:12px;justify-content:space-between;background:var(--card);border:1px solid var(--div);border-radius:10px;padding:12px 10px 12px 14px;font:400 15px/1.45 var(--sans);color:var(--ink);box-shadow:0 4px 14px -12px rgba(21,32,26,.4)}
.ls-send{width:28px;height:28px;flex:none;border-radius:50%;background:var(--green);display:grid;place-items:center}
/* Band spacing (Oct 2026): the message text gets room before the arrow, and the two cards share one
   height with their content centred, so left card, middle and right card sit on one centre line. */
.ls-msg{gap:18px;padding:14px 14px 14px 18px}
.ls-msg > span:first-child{flex:1;min-width:0;padding-right:4px}
.ls-steps{align-items:stretch}
.ls-steps > .ls-dots,.ls-steps > .ls-mid{align-self:center}
.ls-steps > .ls-step{display:flex;flex-direction:column;justify-content:center}
.ls-send svg{width:15px;height:15px;fill:none;stroke:#fff;stroke-width:2.2}
.ls-mid{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px}
.ls-cars{display:flex;gap:6px;opacity:.3}.ls-cars svg{width:64px;height:22px;fill:none;stroke:var(--sec);stroke-width:2}
.ls-dot{width:40px;height:40px;border-radius:50%;background:rgba(30,77,56,.10);box-shadow:0 0 0 8px rgba(30,77,56,.05);display:grid;place-items:center}.ls-dot i{width:10px;height:10px;border-radius:50%;background:var(--green)}
.ls-mtxt{font:600 14px/1.45 var(--sans);color:var(--ink);max-width:22ch}
.ls-ex{font:400 11.5px/1 var(--sans);color:var(--sec);margin:-4px 0 12px}
.ls-fhead{display:flex;gap:10px;align-items:flex-start}
.ls-s,.lx-sam{flex:none;border-radius:50%;background:var(--green);color:#fff;display:grid;place-items:center;font:500 15px/1 var(--serif)}
.ls-s{width:26px;height:26px}
.ls-ftxt{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0;font:400 12.5px/1.35 var(--sans);color:var(--sec)}.ls-ftxt b{font:600 14px/1.3 var(--sans);color:var(--ink)}
.ls-fph{position:relative;width:70px;height:50px;flex:none;border-radius:6px;overflow:hidden;background:var(--ph)}
.noph{position:absolute;inset:0;display:grid;place-items:center;font:600 10px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--sec)}
.ls-fph img,.lx-ph img,.lx-sph img{position:relative;z-index:1;width:100%;height:100%;object-fit:cover;display:block}
.lx{padding:34px 0 8px}
.lx-turn{display:flex;align-items:center;gap:12px;margin:0 0 12px;font:400 14.5px/1.4 var(--sans);color:var(--ink)}.lx-turn b{font-weight:600;min-width:34px}
.lx-av{width:34px;height:34px;flex:none;border-radius:50%;display:grid;place-items:center}
.lx-you{background:var(--ph)}.lx-you svg{width:22px;height:22px;fill:none;stroke:var(--sec);stroke-width:1.8}
.lx-bub{background:#EEEAE1;border-radius:8px;padding:9px 14px}
.lx-in{padding-left:46px}
.lx-range{font:500 17px/1.45 var(--serif);color:var(--ink);margin:18px 0 14px}
.lx-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.lx-card{text-decoration:none;position:relative;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--div);border-radius:10px;overflow:hidden;color:var(--ink)}
.lx-ph{position:relative;display:block;aspect-ratio:16/9;background:var(--ph);margin:10px 10px 0;border-radius:6px;overflow:hidden}
.lx-body{display:flex;flex-direction:column;gap:3px;padding:12px 56px 16px 14px}
.lx-name{font:600 15px/1.3 var(--sans)}.lx-facts,.lx-loc{font:400 13.5px/1.3 var(--sans);color:var(--sec)}
.lx-price{font:600 19px/1.3 var(--sans);margin-top:8px}
.lx-go{position:absolute;right:14px;bottom:18px;width:32px;height:32px;border-radius:50%;border:1px solid var(--border);display:grid;place-items:center}.lx-go svg{width:15px;height:15px;fill:none;stroke:var(--ink);stroke-width:2}
.lx-past{margin-top:14px;background:#EEEAE1;border-radius:10px;padding:14px 16px}
.lx-ph-h{font:500 13.5px/1 var(--sans);color:var(--ink);margin-bottom:12px}
.lx-prow{display:grid;grid-template-columns:repeat(3,1fr)}
.lx-sale{display:flex;gap:12px;align-items:center;color:var(--ink);text-decoration:none;padding:0 16px;border-left:1px solid var(--div)}.lx-sale:first-child{padding-left:0;border-left:0}
.lx-sph{position:relative;width:70px;height:46px;flex:none;border-radius:6px;overflow:hidden;background:var(--ph)}
.lx-stxt{display:flex;flex-direction:column;gap:2px;font:400 12.5px/1.3 var(--sans);color:var(--sec);min-width:0}.lx-stxt span:first-child{color:var(--ink)}.lx-stxt b{color:var(--ink);font-weight:600}
.lk-foot{text-align:center;font:400 12.5px/1.4 var(--sans);color:var(--sec);border-top:1px solid var(--div);padding-top:18px;margin:34px 0 0}
.lk-foot a{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
@media (max-width:860px){.gas-hero{padding:22px 0 26px}.lk-chips{width:auto;max-width:none}.ls-steps,.ls-steps.ls-two{grid-template-columns:1fr}.ls-dots{height:26px;width:2px;margin:6px auto;background-image:radial-gradient(circle,var(--sec) 1px,transparent 1.5px);background-size:2px 8px;background-repeat:repeat-y}.ls-mid{padding:4px 0}.lx-in{padding-left:0}.lx-cards,.lx-prow{grid-template-columns:1fr}.lx-sale{padding:10px 0;border-left:0;border-top:1px solid var(--div)}.lx-sale:first-child{border-top:0;padding-top:0}}
@media (max-width:520px){.ls-act{align-items:stretch}.ls-act .kl-btn{width:100%}.ls{padding:22px 18px 24px;border-radius:14px}.lk-display{font-size:38px}.lk-sub{font-size:16px}}
`;
// Every landing rule is scoped under #lead so the page's own rules never override it.
function scope(css) {
  const pre = sel => { const x = sel.trim(); return !x || x.startsWith("#lead") || x.startsWith("@") ? x : (x === ".lk" ? "#lead" : x.startsWith(".lk ") ? "#lead " + x.slice(4) : "#lead " + x); };
  const fix = block => block.replace(/(^|\})(\s*)([^{}@]+)\{/g, (m, a, b, sel) => a + b + sel.split(",").map(pre).join(",") + "{");
  return css.split("\n").map(line => line.startsWith("@media") ? line.replace(/^([^{]*\{)([\s\S]*)$/, (m, head, rest) => head + fix(rest)) : fix(line)).join("\n");
}
export const LANDING_CSS = HERO_CSS + "\n" + scope(CSS) + "\n" + FEATURE_CARDS_CSS + `
body:has(#lead) .composer{display:none}
body:has(#lead) .scroll .col{margin-top:0}`;
