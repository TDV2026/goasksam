// The Market Check landing (Lane A, Oct 2026, Sam's approved mock): the state before a first search.
// Server-rendered into #ob (the page's client replaces it on the first real search, same as every
// other Market Check render - no second copy of that mechanism). Copy is fixed, exactly as given by
// Sam - no changes, no added words. The example band comes from lib/live/marketCheckExample.js (the
// live One Box engine, cached daily) and is hidden entirely when it does not qualify.
// Visual pass (Oct 2026, Sam's second note: "does not look like the approved mock"): default
// left-text/right-photo hero (lib/heroImage.js's own layout, the same split /buy uses), a widened
// content column scoped to this landing only (#ob:has(#mc-landing)), and the example band rebuilt as
// a two-column panel with a real freshness line and search-example chips. Wording and engine data are
// unchanged from the first ship - only markup/CSS moved.
import { heroHtml, HERO_CSS } from "../heroImage.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = { January: "Jan", February: "Feb", March: "Mar", April: "Apr", May: "May", June: "Jun", July: "Jul", August: "Aug", September: "Sep", October: "Oct", November: "Nov", December: "Dec" };
// lib/asOf.js's lastUpdatedDate() returns "October 8, 2026" (the one shared format, also used by
// /sell); this page's copy calls for the abbreviated month ("Oct 8, 2026"). A local display-only
// conversion, not a second date helper - the underlying date/logic is still lastUpdatedDate's alone.
function abbrevMonth(full) {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/.exec(String(full || ""));
  return m ? `${MONTHS_SHORT[m[1]] || m[1]} ${m[2]}, ${m[3]}` : full;
}
// Mirrors js/onebox.js's monthYear/monthDayYear/monthOnly exactly (same string parsing, no DOM), so
// the example band's freshness line reads identically to the engine's own freshLine() on every other
// Market Check surface.
function monthOnly(dstr) { const p = String(dstr || "").slice(0, 10).split("-"); return p.length >= 2 ? (MONTHS[Number(p[1])] || "") : ""; }
// Item 12 (Oct 2026): the day, not the month - "Oct 6" this year, "Oct 6, 2025" once it isn't.
function freshDay(dstr) {
  const p = String(dstr || "").slice(0, 10).split("-");
  const y = Number(p[0]), mo = Number(p[1]), d = Number(p[2]);
  if (!y || !mo || !d) return "";
  const s = `${MONTHS_SHORT[MONTHS[mo]] || ""} ${d}`;
  return y === new Date().getFullYear() ? s : `${s}, ${y}`;
}
function monthDayYear(iso) {
  const d = new Date(iso); if (isNaN(d)) return "";
  return MONTHS[d.getUTCMonth() + 1] + " " + d.getUTCDate() + ", " + d.getUTCFullYear();
}
const BODY_PLURAL = { coupe: "coupes", cabriolet: "cabriolets", convertible: "convertibles", roadster: "roadsters", targa: "targas", sedan: "sedans", saloon: "saloons", wagon: "wagons", spider: "spiders", spyder: "spyders", hardtop: "hardtops" };
const windowPhrase = label => /12 months|twelve/i.test(label || "") ? "the last twelve months" : "the past two years";
// Mirrors js/onebox.js's carNamePlural exactly (one engine, one answer - the landing's default label,
// with no body style chosen yet, must read the same "997 Carrera S models" the real chip search's own
// eyebrow reads before its body question is answered).
function carNamePlural(name) {
  const n = String(name || "").trim();
  if (!n) return "";
  return (/[A-Z0-9]$/.test(n) || /s$/i.test(n)) ? n + " models" : n + "s";
}
// The pool noun for both the panel label and the sales-section heading ("997 Carrera S coupes", or
// "997 Carrera S models" before the body question is answered) - computed once so the two labels
// never drift apart.
function poolNoun(ex) {
  const bw = ex.bodyStyle ? (BODY_PLURAL[String(ex.bodyStyle).toLowerCase()] || "") : "";
  if (ex.shortLabel && bw) return `${ex.shortLabel} ${bw}`;
  if (ex.shortLabel) return carNamePlural(ex.shortLabel);
  return ex.name;
}
// Body style the TITLE actually names (never inferred) - mirrors lib/onebox.js detectBodyStyle's
// vocabulary exactly, so a card's data-body attribute (js/onebox.js's body-chip reorder) agrees with
// what the live engine itself would classify that same row as.
function cardBodyStyle(title) {
  const t = String(title || "").toLowerCase();
  if (/\bgullwing\b/.test(t)) return "coupe";
  for (const b of ["targa", "coupe", "cabriolet", "convertible", "roadster", "wagon", "sedan"]) if (t.includes(b)) return b;
  return "";
}

const ICON = {
  sliders: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 10h10M22 10h4M6 22h4M16 22h10"/><circle cx="19" cy="10" r="3"/><circle cx="13" cy="22" r="3"/></svg>',
  photo: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 10.5h5.5l2-3h9l2 3H27v17H4z"/><circle cx="16" cy="19" r="5"/></svg>',
  bars: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 26V17M16 26V8M26 26v-6"/><path d="M4 26h24"/></svg>',
  flag: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 27V5M8 6.5h14l-4 5.5 4 5.5H8"/></svg>',
  doc: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 4.5h12.5l4.5 4.5v18H9z"/><path d="M21.5 4.5V9H26M13 15h8M13 19.5h8M13 24h5"/></svg>',
  moon: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M23.5 23.5A11 11 0 1 1 12.3 6a9 9 0 0 0 11.2 17.5z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>'
};

function photoHtml(img, alt, tagHtml) {
  return `<div class="ph${img ? "" : " noimg"}">${img ? `<img src="${esc(img)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.ph').classList.add('noimg');this.remove()">` : ""}<span class="none">No photo</span>${tagHtml || ""}</div>`;
}
// Mirrors js/onebox.js poolCardHtml's shape/classes (visual consistency with the rest of Market
// Check), plus data-mi/data-tx so the client can reorder without a refetch (reorder handler in
// js/onebox.js's wire()). Item 7: the card itself is never the link - only the round arrow button is,
// and only when the engine gave this sale a URL; the "An example" tag sits on the photo, never on a
// real-search card (this function is landing-only).
function exampleCardHtml(c) {
  const venue = (c.platform && c.platform !== "others") ? c.platform : "";
  const meta = [venue, c.month].filter(Boolean).join(" · ");
  const mi = Number(c.mi) > 0 ? Number(c.mi) : "";
  const go = c.url ? `<a class="mc-ex-go" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" aria-label="View this sale">${ICON.arrow}</a>` : "";
  return `<div class="card t mc-ex-card" data-mi="${mi}" data-tx="${esc(c.transmission || "")}" data-body="${esc(cardBodyStyle(c.title))}">` +
    photoHtml(c.image, c.title, '<span class="pill mc-ex-tag">An example</span>') +
    `<div class="cbody"><div class="ctitle">${esc(c.title || "")}</div><div class="mc-ex-sold">Sold: ${esc(usd(c.price))}</div><div class="cmeta">${esc(meta)}</div></div>${go}</div>`;
}
// Same "cap at N, reveal 10 more" pattern js/onebox.js's capCardsHtml uses (same classes, same
// wire() handler already wired to [data-capshow] - no new JS needed for the reveal itself), with the
// mock's centred green button in place of the shared text link.
function capCardsHtml(gridClass, id, cardsHtml, cap) {
  if (!cardsHtml.length) return "";
  if (cardsHtml.length <= cap) return `<div class="${gridClass}" id="${id}" data-stage="cards">${cardsHtml.join("")}</div>`;
  const shown = cardsHtml.slice(0, cap).join("");
  const extra = cardsHtml.slice(cap).map(h => `<div class="cap-extra" hidden>${h}</div>`).join("");
  return `<div class="${gridClass}" id="${id}" data-stage="cards">${shown}${extra}</div>` +
    `<div class="mc-ex-morewrap"><button type="button" class="mc-ex-more capshow" data-capshow="${id}" aria-expanded="false">Show ${Math.min(10, cardsHtml.length - cap)} more &#8594;</button></div>`;
}

// A round dot at each end of the dark (typical-band) section, span-relative like the main app's
// rangebar; stacked "Lowest sale" / "Highest sale" labels under the ends (mock item 6).
function rangeBarHtml(ex) {
  const [lo, hi] = ex.span, [bLo, bHi] = ex.cluster;
  if (!(hi > lo)) return "";
  const pc = x => Math.max(0, Math.min(100, (x - lo) / (hi - lo) * 100));
  const a = pc(bLo), b = pc(bHi);
  return `<div class="mc-ex-bar" data-stage="answer">
    <div class="mc-ex-track"><i class="mc-ex-band" style="left:${a.toFixed(1)}%;width:${Math.max(1.5, b - a).toFixed(1)}%"><span class="mc-ex-dot mc-ex-dot-l"></span><span class="mc-ex-dot mc-ex-dot-r"></span></i></div>
    <div class="mc-ex-ends"><div class="mc-ex-end"><span class="mc-ex-elbl">Lowest sale</span><span class="mc-ex-eamt">${esc(usd(lo))}</span></div><div class="mc-ex-end mc-ex-end-r"><span class="mc-ex-elbl">Highest sale</span><span class="mc-ex-eamt">${esc(usd(hi))}</span></div></div>
  </div>`;
}
// Ports js/onebox.js's freshLine(d) exactly (same two-branch logic: a stale in-scope sale states the
// archive's currency AND this car's latest sale as two facts; otherwise the single-fact online/house
// line) so the example band never claims a freshness the data does not have.
function freshLineHtml(ex) {
  const f = ex && ex.freshness; if (!f) return "";
  const through = f.through, arch = f.archiveThrough;
  if (through && arch && through < arch) {
    const archRecent = (Date.now() - Date.parse(arch + "T00:00:00Z")) <= 2 * 864e5;
    const fact1 = archRecent ? "Sales through last night." : `Sales through ${monthDayYear(arch)}.`;
    const fact2 = `Latest sale: ${freshDay(through)}.`;
    return `<div class="mc-ex-fresh"><span class="dot" aria-hidden="true"></span>${esc(fact1 + " " + fact2)}</div>`;
  }
  let txt = "";
  if (f.mode === "house") { if (f.through) txt = "Auction results through " + monthOnly(f.through) + "."; }
  else if (f.lastNight) txt = "Real sales through last night. Nothing estimated.";
  else if (f.through) txt = "Real sales through " + monthDayYear(f.through) + ". Nothing estimated.";
  if (!txt) return "";
  return `<div class="mc-ex-fresh"><span class="dot" aria-hidden="true"></span>${esc(txt)}</div>`;
}
// Body style block (item 2, Oct 2026): rendered FIRST, alongside the mileage/transmission block
// below, inside the same "Narrow it down" card - a visitor can answer either, or both, either order.
function bodyQuestionBlockHtml(opts) {
  if (!opts || !opts.length) return "";
  const chips = opts.map(o => `<button type="button" class="qchip" data-mc-ex-body="${esc(o.value)}" data-mlabel="${esc(o.label)}">${esc(o.label)}</button>`).join("");
  return `<div class="mc-ex-qblock"><p class="q">Coupe, cabriolet or something else?</p><div class="qchips">${chips}</div></div>`;
}
// The mileage ask gets a 5th "type it" chip (mirrors js/onebox.js's own typeit chip for the real
// earned question); transmission never did.
function earnedQuestionBlockHtml(e) {
  if (!e) return "";
  if (e.kind === "mileage") {
    const chips = (e.buckets || []).map(bk => `<button type="button" class="qchip" data-mc-ex-milemin="${bk.min}" data-mc-ex-milemax="${bk.max == null ? "" : bk.max}" data-mlabel="${esc(bk.label)}">${esc(bk.label)}</button>`).join("") +
      `<button type="button" class="qchip typeit" data-mc-ex-typemiles>type it</button>`;
    return `<div class="mc-ex-qblock"><p class="q">How many miles on it?</p><div class="qchips">${chips}</div></div>`;
  }
  if (e.kind === "transmission" && e.labels) {
    const chips = `<button type="button" class="qchip" data-mc-ex-tx="manual" data-mlabel="${esc(e.labels.manual)}">${esc(e.labels.manual.replace(/^./, c => c.toUpperCase()))}</button>` +
      `<button type="button" class="qchip" data-mc-ex-tx="auto" data-mlabel="${esc(e.labels.auto)}">${esc(e.labels.auto)}</button>`;
    return `<div class="mc-ex-qblock"><p class="q">${esc(e.labels.manual.replace(/^./, c => c.toUpperCase()))} or ${esc(e.labels.auto)}?</p><div class="qchips">${chips}</div></div>`;
  }
  return "";
}
// The "NARROW IT DOWN" white sub-card: one block per question that still applies (body, then
// mileage/transmission), stacked. Omitted entirely once nothing is left to ask.
function earnedCardHtml(e, bodyOptions) {
  const blocks = [bodyQuestionBlockHtml(bodyOptions), earnedQuestionBlockHtml(e)].filter(Boolean);
  if (!blocks.length) return "";
  return `<div class="mc-ex-ask" id="mc-ex-qcard" data-stage="answer"><div class="mc-ex-ask-eyebrow">Narrow it down</div>${blocks.join("")}</div>`;
}

// ex: the reduced object from lib/live/marketCheckExample.js, or null/undefined (band hidden).
function exampleBandHtml(ex) {
  if (!ex) return "";
  const noun = poolNoun(ex);
  const take = ex.samsTake ? `<div class="mc-ex-take"><span class="roundel" aria-hidden="true">SAM</span><div><p class="mc-ex-take-h">Sam’s take</p><p>${esc(ex.samsTake)}</p></div></div>` : "";
  const cards = ex.cards.map(exampleCardHtml);
  return `<section class="mc-ex" aria-label="An example"><div class="mc-ex-eyebrow">An example</div>
    <div class="mc-ex-panel">
      <div class="mc-ex-top">
        <div class="mc-ex-left">
          <div class="mc-ex-plabel" id="mc-ex-plabel" data-shortlabel="${esc(ex.shortLabel || "")}">${esc(noun)}. Sold in ${esc(windowPhrase(ex.windowLabel))}.</div>
          <p class="mc-ex-range">${esc(usd(ex.cluster[0]))} <span class="to">to</span> ${esc(usd(ex.cluster[1]))}</p>
          <p class="mc-ex-landed">Most sales landed here.</p>
          ${rangeBarHtml(ex)}
          ${freshLineHtml(ex)}
        </div>
        <div class="mc-ex-right">${take}</div>
      </div>
      ${earnedCardHtml(ex.earned, ex.bodyOptions)}
    </div>
    <div class="sec-head" data-stage="cards"><h2 id="mc-ex-sales-h2">Recent sales of ${esc(noun)}</h2></div>
    ${capCardsHtml("grid3", "mc-ex-sales", cards, 3)}
    </section>`;
}

// updated: the real last-ingest date (already the full "October 8, 2026" form, lib/asOf.js's shared
// lastUpdatedDate - the same helper /sell uses), or null. example: the reduced object above, or
// null/undefined to hide the band entirely. h1Text: unchanged content, kept in the DOM for
// title/H1/canonical (search rule 3) but visually hidden (item 2) via the page's own .sr utility.
export function landingHtml({ updated, example, h1Text }) {
  const feats = [
    ["sliders", "Cars like yours", "Sam asks about miles, gearbox and version, so the sales you see are close to yours."],
    ["photo", "The closest sales first", "The cars that sold nearest to yours come first, each with its photo, price, date and where it sold."],
    ["bars", "Where most landed", "The range most sales fell in, plus the lowest and highest sale. From real sales, never one guessed number."],
    ["flag", "The odd ones, explained", "Sales far above or below are shown separately, so one unusual car doesn’t mislead you."]
  ].map(([i, h, p]) => `<div class="mc-feat"><span class="mc-fic">${ICON[i]}</span><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("");
  // The FIRST chip is byte-identical to lib/live/marketCheckExample.js's EXAMPLE_CAR_TEXT ("one
  // engine, one answer", Sam, Oct 2026) - tapping it runs the exact query the cached example was
  // built from, so the two read the same pool, range, outliers and freshness, figure for figure.
  const chips = ["2008 Porsche 997 Carrera S", "1966 Ford Mustang Shelby GT350", "1955 Mercedes-Benz 300SL"]
    .map(x => `<button type="button" class="mc-chip" data-mc-chip="${esc(x)}">${esc(x)}</button>`).join("");
  const heroInner = `
    <h1 class="sr">${esc(h1Text)}</h1>
    <p class="mc-upd" data-lead-sentence>${esc("Market Check." + (updated ? ` Updated ${abbrevMonth(updated)}.` : ""))}</p>
    <p class="mc-display">What do cars like yours sell for?</p>
    <p class="mc-sub">Real sales, matched to your car, with the range most landed in and the cars behind it.</p>
    <div class="inbox mc-search" role="search"><label class="sr" for="ob-input">Search a car</label><input id="ob-input" autocomplete="off" placeholder="Your car or its VIN"><button type="button" class="mc-go" id="ob-go">Show me what they sold for</button></div>
    <div class="mc-chips">${chips}</div>
    <p class="mc-vinline">Paste a VIN and Sam finds that exact car&#8217;s own sales.</p>`;
  return `<div id="mc-landing" class="mc">
  ${heroHtml(heroInner)}
  <div class="mc-proof">
    <span class="mc-pitem"><span class="mc-pic">${ICON.doc}</span>A real sale behind every price.</span>
    <span class="mc-pitem"><span class="mc-pic">${ICON.photo}</span>A photo and a date for each one.</span>
    <span class="mc-pitem"><span class="mc-pic">${ICON.moon}</span>Updated every night.</span>
  </div>
  <section class="mc-gets"><h2>What you get.</h2><div class="mc-feats">${feats}</div></section>
  ${exampleBandHtml(example)}
  <p class="mc-foot">Real sales only. Nothing estimated.</p>
</div>`;
}

const CSS = `
#ob:has(#mc-landing){max-width:1080px}
#mc-landing{width:100%}
#mc-landing .gas-hero{padding:30px 0 32px;border-bottom:1px solid var(--div)}
#mc-landing .gas-hero-in{max-width:780px}
.mc-upd{margin:0 0 14px;font:400 13px/1.4 var(--sans);color:var(--sec)}
.mc-display{margin:0 0 14px;font:500 clamp(36px,4.4vw,52px)/1.08 var(--serif);color:var(--ink);letter-spacing:-.02em;max-width:14em;text-wrap:balance}
.mc-sub{margin:0 0 24px;font:400 17px/1.5 var(--sans);color:var(--soft);max-width:36em}
/* Desktop width fix (Oct 2026, Sam: the bar ran over the car in the hero image): capped to 600px,
   left aligned under the headline, well inside the .gas-hero-in 780px text column so it ends before
   the photo. The chips row and the VIN line below it match the bar's own width, never wider. 600 has
   no effect at or under 600px wide, so the mobile "full width of the screen" shape is unchanged. */
.mc-search{width:100%;max-width:600px}
.mc-search input{font-size:16px}
.mc-go{flex:none;border:0;border-radius:10px;background:var(--green);color:#fff;font:600 15px/1.3 var(--sans);padding:0 20px;min-height:48px;cursor:pointer;white-space:nowrap}
.mc-go:hover{background:var(--green-dk)}
@media (max-width:640px){.mc-search{flex-wrap:wrap;padding:10px}.mc-go{width:100%;margin-top:8px}}
.mc-chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px;max-width:600px}
.mc-chip{border:1px solid var(--div);background:rgba(251,248,242,.92);border-radius:999px;padding:8px 14px;font:400 13px/1.2 var(--sans);color:var(--soft);cursor:pointer;min-height:36px;white-space:nowrap}
.mc-chip:hover{border-color:var(--green);color:var(--green)}
.mc-vinline{margin:12px 0 0;font:400 13px/1.4 var(--sans);color:var(--sec);max-width:600px}
/* Proof row (item 8): the same small-pale-green-circle treatment as the feature cards, in miniature,
   with a little extra breathing room between the three so they read as three, not a run-on line. */
.mc-proof{display:flex;flex-wrap:wrap;justify-content:center;padding:22px 0;border-bottom:1px solid var(--div)}
.mc-pitem{display:flex;align-items:center;gap:12px;padding:0 34px;border-left:1px solid var(--div);font:400 14px/1.4 var(--sans);color:var(--soft)}
.mc-pitem:first-child{border-left:0}
.mc-pic{display:flex;align-items:center;justify-content:center;flex:none;width:34px;height:34px;border-radius:50%;background:var(--tint)}
.mc-pic svg{display:block;width:18px;height:18px;fill:none;stroke:var(--green);stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round}
@media (max-width:640px){.mc-proof{flex-direction:column;align-items:flex-start;gap:14px;padding:18px 4px}.mc-pitem{border-left:0;padding:0}}
.mc-gets{padding:32px 0 8px;margin-top:0}
.mc-gets h2{margin:0 0 22px;font:500 clamp(24px,2.8vw,28px)/1.2 var(--serif);color:var(--ink)}
/* "What you get." cards (item 8): each point reads on its own - a white rounded card with a soft
   shadow on the page background, instead of four columns of same-grey text running together. */
.mc-feats{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.mc-feat{background:var(--card);border:1px solid var(--div);border-radius:16px;padding:26px 22px;box-shadow:0 10px 24px -18px rgba(21,32,26,.35)}
.mc-fic{display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;background:var(--tint)}
.mc-fic svg{width:40px;height:40px;fill:none;stroke:var(--green);stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round}
.mc-feat h3{margin:18px 0 8px;font:500 19px/1.3 var(--serif);color:var(--ink)}
.mc-feat p{margin:0;font:400 14px/1.55 var(--sans);color:var(--soft)}
@media (max-width:760px){.mc-feats{grid-template-columns:1fr 1fr}}
@media (max-width:460px){.mc-feats{grid-template-columns:1fr}}
.mc-ex{padding:34px 0 8px;border-top:1px solid var(--div);margin-top:28px;display:flex;flex-direction:column;gap:16px}
.mc-ex-eyebrow{font:600 11.5px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--sec)}
.mc-ex-panel{background:var(--tint);border:1px solid var(--tint-line);border-radius:18px;padding:28px 30px;display:flex;flex-direction:column;gap:20px}
.mc-ex-top{display:grid;grid-template-columns:1.3fr 1fr;gap:28px;align-items:start}
.mc-ex-plabel{font:600 13px/1.4 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--sec)}
.mc-ex-range{margin:10px 0 0;font:600 clamp(32px,4vw,44px)/1.1 var(--serif);color:var(--green);font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.mc-ex-range .to{font-weight:400;font-size:.65em;color:var(--sec)}
.mc-ex-landed{margin:6px 0 0;font:400 18px/1.4 var(--serif);color:var(--ink)}
.mc-ex-bar{margin-top:16px}
.mc-ex-track{position:relative;height:6px;background:var(--border);border-radius:3px;margin:0 0 12px}
.mc-ex-band{position:absolute;top:0;height:6px;background:var(--green);border-radius:3px}
.mc-ex-dot{position:absolute;top:-2px;width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid var(--green)}
.mc-ex-dot-l{left:-5px}.mc-ex-dot-r{right:-5px}
.mc-ex-ends{display:flex;justify-content:space-between}
.mc-ex-end{display:flex;flex-direction:column;gap:2px}
.mc-ex-end-r{align-items:flex-end;text-align:right}
.mc-ex-elbl{font:400 12.5px/1.2 var(--sans);color:var(--sec)}
.mc-ex-eamt{font:600 16px/1.2 var(--sans);color:var(--ink);font-variant-numeric:tabular-nums}
.mc-ex-fresh{display:flex;gap:10px;align-items:center;font:400 13.5px/1.4 var(--sans);color:var(--sec);margin-top:14px}
.mc-ex-fresh .dot{width:8px;height:8px;border-radius:50%;background:var(--live);flex:none}
.mc-ex-right{display:flex}
.mc-ex-take{display:flex;gap:12px;align-items:flex-start;background:var(--card);border-radius:14px;padding:18px 20px;width:100%}
.mc-ex-take p{margin:0;font:400 17px/1.45 var(--serif);color:var(--soft)}
.mc-ex-take p.mc-ex-take-h{margin:0 0 4px;font:600 13px/1.2 var(--sans);letter-spacing:.02em;color:var(--green)}
.mc-ex-ask{background:var(--card);border-radius:14px;padding:18px 22px;display:flex;flex-direction:column;gap:16px}
.mc-ex-ask-eyebrow{font:600 11px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--sec)}
.mc-ex-qblock{display:flex;align-items:center;gap:14px 20px;flex-wrap:wrap}
.mc-ex-ask .q{margin:0;font:400 19px/1.35 var(--serif);color:var(--ink)}
@media (max-width:760px){.mc-ex-top{grid-template-columns:1fr}}
.mc-ex-card{position:relative}
.mc-ex-card .cbody{padding-right:46px}
.mc-ex-tag{top:10px;left:10px;padding:5px 9px;font:600 11px/1 var(--sans);letter-spacing:.04em;text-transform:uppercase}
.mc-ex-sold{font:600 20px/1.3 var(--sans);color:var(--ink);margin-top:2px}
.mc-ex-go{position:absolute;right:12px;bottom:12px;width:34px;height:34px;border-radius:50%;background:var(--card);border:1px solid var(--border);display:grid;place-items:center;color:var(--ink)}
.mc-ex-go:hover{border-color:var(--green);color:var(--green)}
.mc-ex-go svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.mc-ex-morewrap{display:flex;justify-content:center;margin-top:18px}
.mc-ex-morewrap:empty{display:none}
.mc-ex-more{border:0;border-radius:999px;background:var(--green);color:#fff;font:600 15px/1.3 var(--sans);padding:0 24px;min-height:46px;cursor:pointer}
.mc-ex-more:hover{background:var(--green-dk)}
.mc-foot{text-align:center;font:400 12.5px/1.4 var(--sans);color:var(--sec);border-top:1px solid var(--div);padding-top:18px;margin:34px 0 0}
`;
export const LANDING_CSS = HERO_CSS + "\n" + CSS;
