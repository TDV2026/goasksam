// The new Sell landing (Lane C, Oct 2026, Sam's approved mock), behind SELL_NEXT_ON with the rest of the
// new Sell. Server-rendered by api/sellNext.js and handed to the page through the Sell home hook
// (window.GAS_SELL.homeHtml), so js/onebox.js's own wire() attaches the search box (#ob-input/#ob-go) and
// the example chips ([data-mc-chip]) exactly as it does on Market Check; submitting starts the new Sell flow.
// Copy is the mock's, with Sam's changes: "Sam would sell your ..." (no first person), ONE example car from
// the shared engine (lib/sell/sellExample.js), the specialist band display only (a button that starts the
// real flow, no email field), and the three chips Sam named. No figure on this page but real sold prices.
// The hero is lib/heroImage.js's default layout; the four points are lib/featureCards.js.
import fs from "node:fs";
import path from "node:path";
import { heroHtml, HERO_CSS } from "../heroImage.js";
import { featureCardsHtml, FEATURE_CARDS_CSS } from "../featureCards.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monYear = d => { const p = String(d || "").slice(0, 10).split("-"); return p.length >= 2 && MON[Number(p[1]) - 1] ? `${MON[Number(p[1]) - 1]} ${p[0]}` : ""; };
// lib/asOf.js lastUpdatedDate() gives "October 8, 2026"; the mock reads "Oct 8, 2026" (display only).
const shortDate = full => { const m = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s+(\d{4})$/.exec(String(full || "")); return m ? `${m[1]} ${m[2]}, ${m[3]}` : full; };

// Each names its body style, so the chip reads the same group as the example for that car (a 997 Carrera S
// without "Coupe" reads coupes and cabriolets together). The Mustang's "Fastback" is its body style.
export const CHIPS = ["2008 Porsche 997 Carrera S Coupe", "1967 Ford Mustang Fastback", "2015 Chevrolet Corvette Z06 Coupe"];

const ICON = {
  chat: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5C9 5 4 9.4 4 14.8c0 3 1.6 5.6 4.1 7.4L7 27l5.2-2.9c1.2.3 2.5.5 3.8.5 7 0 12-4.4 12-9.8S23 5 16 5z"/></svg>',
  pin: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 28s-8.5-8.2-8.5-14.5a8.5 8.5 0 0 1 17 0C24.5 19.8 16 28 16 28z"/><circle cx="16" cy="13.5" r="3.2"/></svg>',
  calendar: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5.5 8.5h21v18h-21zM5.5 13.5h21M11 5v6M21 5v6"/><path d="M11 18.5h.01M16 18.5h.01M21 18.5h.01M11 22.5h.01M16 22.5h.01"/></svg>',
  people: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="11" r="4"/><circle cx="7.5" cy="13" r="3"/><circle cx="24.5" cy="13" r="3"/><path d="M9.5 26c.8-4.6 3.2-7 6.5-7s5.7 2.4 6.5 7M3 25c.4-3.2 2-5 4.5-5M29 25c-.4-3.2-2-5-4.5-5"/></svg>',
  gavel: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M14 4.5l8 8M10.5 8l8 8M12.2 6.2l4.3-1.8 6.6 6.6-1.8 4.3M14.5 13.5L5.5 22.5l3.5 3.5 9-9M4 28.5h14"/></svg>',
  doc: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8.5 4.5h15v23h-15zM12.5 10.5h7M12.5 15h7M12.5 19.5h4.5"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
};
const TILE_ICON = { where: "gavel", reserve: "doc", day: "calendar", next_sale: "calendar" };

function photo(url, alt, cls) {
  return `<span class="${cls}">${url ? `<img src="${esc(url)}" alt="${esc(alt || "")}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<span class="sl-noph">No photo</span></span>`;
}

// The example band: where Sam would sell the example car, its reasons in words, its selling page.
function exampleHtml(ex) {
  const name = ex.cohort || ex.label;
  const tiles = ex.tiles.map(t => `<div class="sl-tile"><span class="sl-tic">${ICON[TILE_ICON[t.key] || "doc"]}</span><div><div class="sl-tl">${esc(t.label)}</div><p class="sl-tw">${esc(t.words)}</p></div></div>`).join("");
  // A sale from the same pool that is not in the recent sales strip (never the same car twice on the page).
  const shot = ex.bandPhoto && ex.bandPhoto.photo ? ex.bandPhoto : null;
  // No venue anywhere on the landing (Sam, Oct 2026): the button starts the flow, the venue comes with the result.
  const cta = `<button type="button" class="sl-cta" data-sl-start>Find out where yours would sell${ICON.right}</button>`;
  return `<section class="sl-band sl-ex" aria-label="An example">
    <div class="sl-bl">
      <div class="sl-eye">Where Sam would sell it</div>
      <h2 class="sl-h">Sam knows where this ${esc(name)} would sell best, and why.</h2>
      <div class="sl-tiles">${tiles}</div>
      ${cta}
    </div>
    ${shot ? `<figure class="sl-fig">${photo(shot.photo, shot.title, "sl-ph")}<figcaption>An example</figcaption></figure>` : ""}
  </section>`;
}
// The specialist band's photo: one file in the repo (2:1.4 or so, a person with a car, JPG under ~300 KB).
// Shown only once the file exists, so the band never shows an empty frame before it is uploaded.
export const SPECIALIST_IMAGE_PATH = "img/sell/specialist.jpg";
let specialistImg = null;
const hasSpecialistImg = () => (specialistImg ??= fs.existsSync(path.join(process.cwd(), SPECIALIST_IMAGE_PATH)));
// Display only: no partner name, no form. The button starts the flow at the beginning (no car prefilled)
// with a specialist intent, so the result leads with the specialist once the car is known
// (lib/sell/sellMcClient.js [data-sl-handled]).
function specialistHtml(ex) {
  return `<section class="sl-band sl-ps" aria-label="An example">
    <div class="sl-bl">
      <div class="sl-eye">Who Sam would recommend</div>
      <h2 class="sl-h">Or hand it to a specialist.</h2>
      <p class="sl-p">Specialists who handle sales for this kind of car from start to finish.</p>
      <button type="button" class="sl-cta" data-sl-handled>See who Sam would call${ICON.right}</button>
    </div>
    ${hasSpecialistImg() ? `<figure class="sl-fig sl-psfig"><span class="sl-ph"><img src="/${SPECIALIST_IMAGE_PATH}" alt="" loading="lazy" onerror="this.closest('figure').remove()"></span><figcaption>An example</figcaption></figure>` : ""}
  </section>`;
}
function salesHtml(ex) {
  const list = (ex.recent || []).slice(0, 3);
  if (!list.length) return "";
  return `<section class="sl-sales"><div class="sl-eye">Recent sales of similar cars</div><div class="sl-grid">${list.map(s => {
    // No venue and no listing link on the landing (a link would name the site); the date only.
    const body = `<span class="sl-sphw">${photo(s.photo, s.title, "sl-sph")}<span class="sl-tag">An example</span></span><span class="sl-sb"><b class="sl-st">${esc(s.title || ex.label)}</b><span class="sl-sp">Sold: ${esc(usd(s.price))}</span><span class="sl-sv">${esc(monYear(s.date))}</span></span>`;
    return `<div class="sl-sale">${body}</div>`;
  }).join("")}</div></section>`;
}

// updated: lib/asOf.js lastUpdatedDate() or null. example: lib/sell/sellExample.js's reduced example, or null
// (the example band, the specialist band and the recent sales strip are then all hidden).
export function sellLandingHtml({ updated, example }) {
  const feats = [
    { icon: ICON.chat, title: "Tell Sam the car", body: "Sam asks one question at a time, only the ones that matter for that car." },
    { icon: ICON.pin, title: "Where it sells best", body: "Sam picks the place cars like yours have actually sold, and tells you why." },
    { icon: ICON.calendar, title: "Reserve and timing", body: "Whether most of them sold with a reserve, and which day of the week to end your auction." },
    { icon: ICON.people, title: "Or have it handled", body: "If you’d rather not do it yourself, Sam points you to a specialist for your kind of car who runs the whole sale." }
  ];
  const chips = CHIPS.map(x => `<button type="button" class="sl-chip" data-mc-chip="${esc(x)}">${esc(x)}</button>`).join("");
  const heroInner = `
    <p class="sl-upd" data-lead-sentence>${esc("Selling a collector car." + (updated ? ` Updated ${shortDate(updated)}.` : ""))}</p>
    <h1 class="sl-display">Tell Sam what you’re selling.</h1>
    <p class="sl-sub">Sam shows you where cars like yours sell best, and who can handle the sale if you’d rather not.</p>
    <div class="sl-search" role="search"><label for="ob-input" class="sr">What are you selling?</label><input id="ob-input" autocomplete="off" enterkeyhint="go" placeholder="What are you selling?"><button type="button" class="sl-mic" data-slmic aria-label="Speak instead of typing" aria-pressed="false">${ICON.mic}</button><button type="button" class="sl-go" id="ob-go" aria-label="Go">${ICON.arrow}</button></div>
    <div class="sl-chips">${chips}</div>
    <p class="sl-hint" id="sl-hint" hidden>Tell Sam the car. Once Sam knows it, the specialist comes first.</p>`;
  const ex = example && example.platform && (example.tiles || []).some(t => t.key === "where") ? example : null;
  return `<div id="sl-landing">
  ${heroHtml(heroInner)}
  <section class="sl-more"><h2 class="sl-h2">No price guesses. Just where it sells.</h2>${featureCardsHtml(feats)}</section>
  ${ex ? exampleHtml(ex) : ""}
  ${ex && ex.partner ? specialistHtml(ex) : ""}
  ${ex ? salesHtml(ex) : ""}
  <p class="sl-foot">Real sales only. Nothing estimated.</p>
</div>`;
}

const CSS = `
#ob:has(#sl-landing){max-width:1080px}
#sl-landing{width:100%}
#sl-landing .gas-hero{padding:30px 0 34px;border-bottom:1px solid var(--div)}
#sl-landing .gas-hero-in{max-width:600px}
.sl-upd{margin:0 0 14px;font:400 13px/1.4 var(--sans);color:var(--sec)}
.sl-display{margin:0 0 16px;font:500 clamp(38px,4.6vw,56px)/1.04 var(--serif);color:var(--ink);letter-spacing:-.02em;max-width:11em}
.sl-sub{margin:0 0 24px;font:400 17px/1.55 var(--sans);color:var(--soft);max-width:30em}
.sl-search{display:flex;align-items:center;gap:6px;max-width:470px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:4px 6px 4px 18px;box-shadow:0 8px 24px -20px rgba(21,32,26,.45)}
.sl-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:400 16px/1.4 var(--sans);color:var(--ink);padding:12px 0}
.sl-search input::placeholder{color:var(--sec)}
.sl-mic{width:40px;height:40px;flex:none;border:0;border-radius:10px;display:grid;place-items:center;cursor:pointer;background:transparent;color:var(--ink)}
.sl-mic svg{width:18px;height:18px;fill:currentColor}.sl-mic.on{color:var(--green)}
.sl-go{width:40px;height:40px;flex:none;border:0;border-radius:50%;background:var(--green);display:grid;place-items:center;cursor:pointer;padding:0}
.sl-go svg{width:18px;height:18px;fill:none;stroke:#fff;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.sl-go:focus-visible,.sl-mic:focus-visible{outline:2px solid var(--green);outline-offset:2px}
.sl-chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
.sl-chip{border:1px solid var(--div);background:rgba(251,248,242,.92);border-radius:999px;padding:8px 14px;font:400 13px/1.2 var(--sans);color:var(--soft);cursor:pointer;min-height:36px}
.sl-chip:hover{border-color:var(--green);color:var(--green)}
.sl-hint{margin:12px 0 0;font:500 14px/1.45 var(--sans);color:var(--green)}
.sl-more{padding:34px 0 30px}
.sl-h2{margin:0 0 22px;font:500 clamp(28px,3.2vw,38px)/1.15 var(--serif);color:var(--ink);letter-spacing:-.01em}
.sl-band{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:28px;align-items:center;background:var(--tint);border:1px solid var(--tint-line);border-radius:18px;padding:28px 30px;margin:0 0 20px}
.sl-band:not(:has(.sl-fig)){grid-template-columns:1fr}
.sl-eye{font:600 11.5px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--sec);margin:0 0 14px}
.sl-h{margin:0 0 18px;font:500 clamp(26px,3vw,34px)/1.18 var(--serif);color:var(--ink);letter-spacing:-.01em}
.sl-p{margin:-4px 0 20px;font:400 16.5px/1.55 var(--sans);color:var(--soft)}
.sl-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 20px}
.sl-tile{display:flex;gap:12px;align-items:flex-start;background:var(--card);border-radius:12px;padding:16px 16px 18px}
.sl-tic svg{width:28px;height:28px;fill:none;stroke:var(--ink);stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round;display:block}
.sl-tl{font:600 14px/1.3 var(--sans);color:var(--ink);margin:2px 0 6px}
.sl-tw{margin:0;font:400 14px/1.5 var(--sans);color:#4A5650}
.sl-cta{display:inline-flex;align-items:center;gap:10px;border:0;border-radius:10px;background:var(--green);color:#fff;font:600 15px/1.3 var(--sans);padding:14px 22px;text-decoration:none;cursor:pointer}
.sl-cta:hover{background:var(--green-dk)}
.sl-cta svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.sl-fig{margin:0;display:flex;flex-direction:column;gap:8px}
.sl-ph{position:relative;display:block;aspect-ratio:3/2;border-radius:10px;overflow:hidden;background:var(--ph,#E9E5DC)}
.sl-ph img,.sl-sph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1}
.sl-noph{position:absolute;inset:0;display:grid;place-items:center;font:600 11px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--sec)}
.sl-fig figcaption{align-self:flex-end;font:italic 400 12.5px/1 var(--sans);color:var(--sec)}
.sl-sales{padding:14px 0 6px}
.sl-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.sl-sale{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--div);border-radius:12px;overflow:hidden;color:var(--ink);text-decoration:none}
.sl-sale:hover{border-color:var(--green)}
.sl-sph{position:relative;display:block;aspect-ratio:16/9;background:var(--ph,#E9E5DC)}
.sl-sphw{position:relative;display:block}
.sl-tag{position:absolute;right:8px;bottom:8px;z-index:2;font:italic 400 11.5px/1 var(--sans);color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6)}
.sl-sph:not(:has(img)) + .sl-tag{color:var(--sec);text-shadow:none}
.sl-sb{display:flex;flex-direction:column;gap:5px;padding:14px 14px 16px}
.sl-st{font:600 14.5px/1.35 var(--sans)}
.sl-sp{font:600 15px/1.3 var(--sans);font-variant-numeric:tabular-nums}
.sl-sv{font:400 13px/1.4 var(--sans);color:var(--sec)}
.sl-foot{text-align:center;font:400 13px/1.4 var(--sans);color:var(--sec);border-top:1px solid var(--div);padding-top:18px;margin:30px 0 0}
@media (max-width:860px){.sl-band{grid-template-columns:1fr}.sl-fig{order:-1}.sl-tiles{grid-template-columns:1fr}.sl-grid{grid-template-columns:1fr 1fr}}
@media (max-width:560px){.sl-band{padding:22px 18px}.sl-grid{grid-template-columns:1fr}.sl-cta{width:100%;justify-content:center;box-sizing:border-box}.sl-display{font-size:38px}}
`;
export const SELL_LANDING_CSS = HERO_CSS + "\n" + FEATURE_CARDS_CSS + "\n" + CSS;
