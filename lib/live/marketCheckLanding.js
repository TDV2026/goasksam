// The Market Check landing (Lane A, Oct 2026, Sam's approved mock): the state before a first search.
// Server-rendered into #ob (the page's client replaces it on the first real search, same as every
// other Market Check render - no second copy of that mechanism). Copy is fixed, exactly as given by
// Sam - no changes, no added words. The example band comes from lib/live/marketCheckExample.js (the
// live One Box engine, cached daily) and is hidden entirely when it does not qualify.
import { heroHtml, HERO_CSS } from "../heroImage.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
const MONTHS_SHORT = { January: "Jan", February: "Feb", March: "Mar", April: "Apr", May: "May", June: "Jun", July: "Jul", August: "Aug", September: "Sep", October: "Oct", November: "Nov", December: "Dec" };
// lib/asOf.js's lastUpdatedDate() returns "October 8, 2026" (the one shared format, also used by
// /sell); this page's copy calls for the abbreviated month ("Oct 8, 2026"). A local display-only
// conversion, not a second date helper - the underlying date/logic is still lastUpdatedDate's alone.
function abbrevMonth(full) {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/.exec(String(full || ""));
  return m ? `${MONTHS_SHORT[m[1]] || m[1]} ${m[2]}, ${m[3]}` : full;
}

const ICON = {
  sliders: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 10h10M22 10h4M6 22h4M16 22h10"/><circle cx="19" cy="10" r="3"/><circle cx="13" cy="22" r="3"/></svg>',
  target: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="10.5"/><circle cx="16" cy="16" r="5.5"/><circle cx="16" cy="16" r="1" fill="currentColor" stroke="none"/></svg>',
  bars: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 26V17M16 26V8M26 26v-6"/><path d="M4 26h24"/></svg>',
  flag: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 27V5M8 6.5h14l-4 5.5 4 5.5H8"/></svg>'
};

function photoHtml(img, alt) {
  return `<div class="ph${img ? "" : " noimg"}">${img ? `<img src="${esc(img)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.ph').classList.add('noimg');this.remove()">` : ""}<span class="none">No photo</span></div>`;
}
// Mirrors js/onebox.js poolCardHtml's shape/classes exactly (visual consistency with the rest of
// Market Check), plus data-mi/data-tx so the client can reorder without a refetch (item 3).
function exampleCardHtml(c) {
  const venue = (c.platform && c.platform !== "others") ? c.platform : "";
  const meta = [c.mileageText && c.mileageText !== "TMU" ? c.mileageText : "", venue, c.month].filter(Boolean).join(" · ");
  const mi = Number(c.mi) > 0 ? Number(c.mi) : "";
  const inner = `${photoHtml(c.image, c.title)}<div class="cbody"><span class="cprice num">${esc(usd(c.price))}</span><div class="ctitle">${esc(c.title || "")}</div><div class="cmeta">${esc(meta)}</div></div>`;
  return c.url
    ? `<a class="card t mc-ex-card" data-mi="${mi}" data-tx="${esc(c.transmission || "")}" href="${esc(c.url)}" target="_blank" rel="noopener">${inner}</a>`
    : `<div class="card t mc-ex-card" data-mi="${mi}" data-tx="${esc(c.transmission || "")}">${inner}</div>`;
}
// Same "cap at 4, reveal 10 more" pattern js/onebox.js's capCardsHtml uses (same classes, same
// wire() handler already wired to [data-capshow] - no new JS needed for the reveal itself).
function capCardsHtml(gridClass, id, cardsHtml, cap) {
  if (!cardsHtml.length) return "";
  if (cardsHtml.length <= cap) return `<div class="${gridClass}" id="${id}" data-stage="cards">${cardsHtml.join("")}</div>`;
  const shown = cardsHtml.slice(0, cap).join("");
  const extra = cardsHtml.slice(cap).map(h => `<div class="cap-extra" hidden>${h}</div>`).join("");
  return `<div class="${gridClass}" id="${id}" data-stage="cards">${shown}${extra}</div>` +
    `<button type="button" class="linkbtn capshow" data-capshow="${id}" aria-expanded="false">Show ${Math.min(10, cardsHtml.length - cap)} more &#8594;</button>`;
}

function rangeBarHtml(ex) {
  const [lo, hi] = ex.span, [bLo, bHi] = ex.cluster;
  if (!(hi > lo)) return "";
  const pc = x => Math.max(0, Math.min(100, (x - lo) / (hi - lo) * 100));
  const a = pc(bLo), b = pc(bHi);
  return `<div class="rangebar" data-stage="answer"><div class="rb-row"><span class="rb-end rb-lo">${esc(`Lowest sale ${usd(lo)}`)}</span>` +
    `<span class="rb-track"><i class="rb-band" style="left:${a.toFixed(1)}%;width:${Math.max(1.5, b - a).toFixed(1)}%"></i></span>` +
    `<span class="rb-end rb-hi">${esc(`Highest sale ${usd(hi)}`)}</span></div></div>`;
}
function earnedCardHtml(e) {
  if (!e) return "";
  if (e.kind === "mileage") {
    const chips = (e.buckets || []).map(bk => `<button type="button" class="qchip" data-mc-ex-milemin="${bk.min}" data-mc-ex-milemax="${bk.max == null ? "" : bk.max}" data-mlabel="${esc(bk.label)}">${esc(bk.label)}</button>`).join("");
    return `<div class="qcard earned mc-ex-qcard" id="mc-ex-qcard" data-stage="answer"><p class="q">How many miles on it?</p><div class="qchips">${chips}</div></div>`;
  }
  if (e.kind === "transmission" && e.labels) {
    const chips = `<button type="button" class="qchip" data-mc-ex-tx="manual" data-mlabel="${esc(e.labels.manual)}">${esc(e.labels.manual.replace(/^./, c => c.toUpperCase()))}</button>` +
      `<button type="button" class="qchip" data-mc-ex-tx="auto" data-mlabel="${esc(e.labels.auto)}">${esc(e.labels.auto)}</button>`;
    return `<div class="qcard earned mc-ex-qcard" id="mc-ex-qcard" data-stage="answer"><p class="q">${esc(e.labels.manual.replace(/^./, c => c.toUpperCase()))} or ${esc(e.labels.auto)}?</p><div class="qchips">${chips}</div></div>`;
  }
  return "";
}

// ex: the reduced object from lib/live/marketCheckExample.js, or null/undefined (band hidden).
function exampleBandHtml(ex) {
  if (!ex) return "";
  const take = ex.samsTake ? `<div class="mc-ex-take"><span class="roundel" aria-hidden="true">SAM</span><p>${esc(ex.samsTake)}</p></div>` : "";
  const cards = ex.cards.map(exampleCardHtml);
  return `<section class="mc-ex" aria-label="An example"><div class="mc-ex-eyebrow">An example</div>
    <div class="mc-ex-head"><span class="eyebrow">${esc(ex.name)} &middot; sold</span><p class="range band">${esc(usd(ex.cluster[0]))} <span class="to">to</span> ${esc(usd(ex.cluster[1]))}</p><p class="landed">Where most sold.</p>${rangeBarHtml(ex)}</div>
    ${take}
    ${earnedCardHtml(ex.earned)}
    <div class="sec-head" data-stage="cards"><div><h2 id="mc-ex-sales-h2">Recent sales</h2></div></div>
    ${capCardsHtml("grid3", "mc-ex-sales", cards, 4)}
    </section>`;
}

// updated: the real last-ingest date (already the full "October 8, 2026" form, lib/asOf.js's shared
// lastUpdatedDate - the same helper /sell uses), or null. example: the reduced object above, or
// null/undefined to hide the band entirely.
export function landingHtml({ updated, example, h1Text }) {
  const feats = [
    ["sliders", "Cars like yours"],
    ["target", "The closest sales first"],
    ["bars", "Where most landed"],
    ["flag", "The odd ones, explained"]
  ].map(([i, label]) => `<div class="mc-feat"><span class="mc-fic">${ICON[i]}</span><p>${esc(label)}</p></div>`).join("");
  const heroInner = `
    <h1 class="mc-h1">${esc(h1Text)}</h1>
    <p class="mc-upd" data-lead-sentence>${esc("Market Check." + (updated ? ` Updated ${abbrevMonth(updated)}.` : ""))}</p>
    <p class="mc-display">What&#8217;s your car going for?</p>
    <p class="mc-sub">Not what it should sell for. What cars like yours actually did, with the receipts.</p>`;
  return `<div id="mc-landing" class="mc">
  ${heroHtml(heroInner, { layout: "banner" })}
  <div class="mc-head">
    <div class="inbox" role="search"><label class="sr" for="ob-input">Search a car</label><input id="ob-input" autocomplete="off" placeholder="Your car, for example 2008 Porsche 997 Carrera S"><button type="button" class="mc-go" id="ob-go">Show me what they sold for</button></div>
    <div class="mc-proof"><span>A real sale behind every price.</span><span>A photo and a date for each one.</span><span>Updated every night.</span></div>
  </div>
  <section class="mc-gets"><h2>What you get.</h2><div class="mc-feats">${feats}</div></section>
  ${exampleBandHtml(example)}
  <p class="mc-foot">Real sales only. Nothing estimated.</p>
</div>`;
}

const CSS = `
#mc-landing{width:100%}
.mc-head{padding:22px 0 8px}
.mc-h1{margin:0 0 4px;font:500 12.5px/1.4 var(--sans);color:var(--sec)}
.mc-upd{margin:0 0 14px;font:400 13px/1.4 var(--sans);color:var(--sec)}
.mc-display{margin:0 0 14px;font:500 clamp(36px,4.4vw,52px)/1.08 var(--serif);color:var(--ink);letter-spacing:-.02em;max-width:14em;text-wrap:balance}
.mc-sub{margin:0 0 24px;font:400 17px/1.5 var(--sans);color:var(--soft);max-width:36em}
.mc-head .inbox{max-width:640px}
.mc-head .inbox input{font-size:16px}
.mc-go{flex:none;border:0;border-radius:10px;background:var(--green);color:#fff;font:600 15px/1.3 var(--sans);padding:0 20px;min-height:48px;cursor:pointer;white-space:nowrap}
.mc-go:hover{background:var(--green-dk)}
@media (max-width:640px){.mc-head .inbox{flex-wrap:wrap;padding:10px}.mc-go{width:100%;margin-top:8px}}
.mc-proof{display:flex;flex-wrap:wrap;gap:8px 22px;margin-top:20px;font:400 13.5px/1.4 var(--sans);color:var(--sec)}
.mc-proof span{position:relative;padding-left:16px}
.mc-proof span::before{content:"";position:absolute;left:0;top:7px;width:6px;height:6px;border-radius:50%;background:var(--green)}
.mc-gets{padding:32px 0 8px;border-top:1px solid var(--div);margin-top:28px}
.mc-gets h2{margin:0 0 22px;font:500 clamp(24px,2.8vw,28px)/1.2 var(--serif);color:var(--ink)}
.mc-feats{display:grid;grid-template-columns:repeat(4,1fr);gap:22px}
.mc-feat{padding:0 18px;border-left:1px solid var(--div)}
.mc-feat:first-child{padding-left:0;border-left:0}
.mc-fic svg{width:28px;height:28px;fill:none;stroke:var(--ink);stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round}
.mc-feat p{margin:12px 0 0;font:500 15px/1.35 var(--sans);color:var(--ink)}
@media (max-width:640px){.mc-feats{grid-template-columns:1fr 1fr;row-gap:24px}.mc-feat:nth-child(3){padding-left:0;border-left:0}}
@media (max-width:420px){.mc-feats{grid-template-columns:1fr}.mc-feat{padding:0;border-left:0}}
.mc-ex{padding:34px 0 8px;border-top:1px solid var(--div);margin-top:28px;display:flex;flex-direction:column;gap:16px}
.mc-ex-eyebrow{font:600 11.5px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--sec)}
.mc-ex-head .eyebrow{font:600 13px/1.4 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--sec)}
.mc-ex-head .landed{margin:0;font:400 20px/1.4 var(--serif);color:var(--ink)}
.mc-ex-head .rangebar{margin-top:10px}
.mc-ex-take{display:flex;gap:12px;align-items:flex-start;background:var(--take);border-radius:14px;padding:16px 18px}
.mc-ex-take p{margin:0;font:400 17px/1.45 var(--serif);color:var(--soft)}
.mc-foot{text-align:center;font:400 12.5px/1.4 var(--sans);color:var(--sec);border-top:1px solid var(--div);padding-top:18px;margin:34px 0 0}
`;
export const LANDING_CSS = HERO_CSS + "\n" + CSS;
