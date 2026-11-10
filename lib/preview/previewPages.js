// CREW-ONLY DESIGN PREVIEWS: /preview/home and /preview/find (Lane E, Nov 4 2026), from the three mockups in docs/design/ and Sam's correction brief
// (docs/design/homepage-find-brief.md). Served only by api/crewPage.js (crew cookie, or the platform's own 404), never linked, never in a sitemap, noindex.
// They compute nothing: the words are data/copy.json, the brief's own lines and the engine's approved example searches (lib/startPlaceholders.js, run through the
// engine by scripts/placeholderCheck.mjs --live); the real-sales block is a labelled placeholder until Lane B's engine field lands, and no figure is typed.
//
// ONE DESIGN SYSTEM (brief 1): header(), searchBox(), pills() and footer() and the tokens and type styles in CSS are written ONCE and used by both pages;
// scripts/previewCopyCheck.mjs compares the two pages' header, search box, pills and footer byte for byte.
//
// WHERE THE RULES WIN OVER THE BRIEF OR THE MOCKUPS (also listed in docs/lane-notes.md):
//  - the real-sales block (brief 15) is a labelled placeholder: no typed figure and no real car until Lane B's engine field exists;
//  - "How Sam decides" (brief 16) prints the four approved rules word for word, in the brief's editorial layout (intro column plus four numbered columns);
//  - the Porsche photographs are crops of the mockups (no original asset exists in the repo), used as they are;
//  - the pills label reads "Go ask Sam:" so the approved call to action stays in the copy; the submit itself is the compact arrow;
//  - a visitor with no history sees "Searches to try" (engine-approved searches), never a "Recent searches" heading naming searches they did not make;
//  - the footer links are the site's own approved copy ("For business", "What's new"); the copyright year (a typed number) is left out.
import fs from "node:fs";
import path from "node:path";
import { copy, copyText } from "../copy.js";
import { PLACEHOLDERS } from "../startPlaceholders.js";
import { reasonLine } from "../reasonWords.js";
import { ENTRY_BRIEF_COPY } from "../entryCopy.js";
import { FONT_LINKS } from "../../api/_chrome.js";
import { jsonForScript, realCardsScripts } from "./realCards.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const img = name => { try { return "data:image/jpeg;base64," + fs.readFileSync(path.join(process.cwd(), "lib/crewPages/preview", name)).toString("base64"); } catch { return ""; } };
const DAILY_VROOM = "https://thedailyvroom.com";
const PLACEHOLDER = "Tell Sam what you're looking for...";
const FIND_LEAD = "Search live and recent auctions across multiple platforms.";
const HERO_SUB = "Find your next car. See real sales. Discover where to sell.";
// Sam's three columns, exact (Nov 6 2026)
const WAYS = { find: "Search live car auctions in one place.", mc: "See what comparable cars actually sold for.", sell: "Find where similar cars sold successfully." };

// HOW SAM DECIDES (Sam's final brief, Nov 5 2026): his words, printed as given. Checked against the live engine before they were set: 1 the ranges are built from completed sales only (sold results; no classified asking prices exist in the data, a bid
// that did not meet reserve is not a sale); 2 the pool is cut by generation, body, trim and gearbox, and mileage is used (mileage bands, the closest match is nearest on spec and mileage, the miles question narrows a wide pool); 3 a thin pool says so
// (the engine's too-few and apart lines) instead of a range; 4 every range carries its count and its sales behind See the sales.
export function rulesOf() {
  return { head: "How Sam decides", lead: "Every range starts with real completed sales of comparable cars.", rules: [
    { h: "Completed sales only", b: "We use actual selling prices, not dealer asking prices or unsuccessful bids." },
    { h: "Like with like", b: "We look for relevant models, specifications and mileage, not just matching badges." },
    { h: "No invented answers", b: "When evidence is limited, we make that clear rather than pretending to know more." },
    { h: "Evidence you can inspect", b: "See how many sales support the result and explore the transactions behind it." }
  ] };
}

// THE FEATURED HISTORY (Sam's final brief, Phase 3): ONE real car at auction now that the engine has identified as sold or listed before. The page reads ONE engine field, featuredHistory (built by Lane B), and prints it as given.
//   featuredHistory = { kind:"sold"|"listed", headline, current:{ title, platform, url, photo, live:true, endsAt, mileage }, previous:{ date, platform, mileage, price (sold only), photo, url }, mileageWords (only when both readings are reliable and the reading went up), take, selectedAt, checkedAt, findUrl }   with previous.historyUrl (the car's history page, /vin/ plus the VIN)
// featuredHistoryOf() is the gate: anything short of a complete, honest field returns null and the whole section is HIDDEN (never an expired auction, a placeholder or an invented car). It checks presence and shape only; it makes no figure.
const VALUATION = /\b(worth|valuation|valued|estimate[ds]?|appraisal|appraised|undervalued|overvalued|bargain|steal|cheap)\b/i;
const httpsUrl = (u, allowData) => typeof u === "string" && (/^https:\/\/[^\s"'<>]+$/.test(u) || (allowData === true && /^data:image\//.test(u)));
export function featuredHistoryOf(fh, { now = NaN, allowData = false } = {}) {   // no clock given, no section: the caller (the server, once Sam says so) passes the time
  const f = fh && typeof fh === "object" ? fh : null; if (!f) return null;
  const c = f.current && typeof f.current === "object" ? f.current : null, p = f.previous && typeof f.previous === "object" ? f.previous : null; if (!c || !p) return null;
  const str = x => typeof x === "string" && x.trim().length > 0;
  if (f.kind !== "sold" && f.kind !== "listed") return null;
  if (!str(f.headline) || !str(f.take) || VALUATION.test(f.headline) || VALUATION.test(f.take)) return null;
  if (f.kind === "sold" && !/\bsold before\b/i.test(f.headline)) return null;                                              // a sale is called a sale only for a verified completed sale
  if (f.kind === "listed" && (!/\blisted before\b/i.test(f.headline) || /\bsold\b/i.test(f.headline) || /\bsold\b/i.test(f.take))) return null;   // a listing, an unsold auction or a rejected bid is never called a sale
  if (!str(c.title) || !str(c.platform) || !httpsUrl(c.url) || !httpsUrl(c.photo, allowData) || c.live !== true) return null;
  const ends = Date.parse(c.endsAt); if (!Number.isFinite(ends) || !(ends > now)) return null;                                  // an auction that has ended is never shown
  if (!str(p.date) || !/\b(?:19|20)\d{2}\b/.test(p.date) || !str(p.platform) || !httpsUrl(p.url) || !httpsUrl(p.photo, allowData)) return null;
  if (f.kind === "sold" && !(Number(p.price) > 0)) return null;
  if (f.kind === "listed" && p.price != null) return null;
  if (!Number.isFinite(Date.parse(f.selectedAt)) || !Number.isFinite(Date.parse(f.checkedAt))) return null;
  if (f.findUrl != null && (typeof f.findUrl !== "string" || !/^\/(?:find|buy)(?:[?#]|$)/.test(f.findUrl) || /^\/\//.test(f.findUrl))) return null;
  if (typeof p.historyUrl !== "string" || !/^\/vin\/[^\s\/?#]+$/.test(p.historyUrl)) return null;                          // the car's own history page, on this site
  if (f.mileageWords != null && (!str(f.mileageWords) || /\b(?:fewer|less|lower|down|drop)/i.test(f.mileageWords))) return null;   // the words are the engine's; a lower reading is never worded
  const mi = x => x == null || (typeof x === "string" && x.trim()) || (Number.isFinite(Number(x)) && Number(x) >= 0);
  if (!mi(c.mileage) || !mi(p.mileage)) return null;
  // THE FIGURE LINES ARE THE ENGINE'S (lib/live/featuredHistory.js withFigureLines, reason table): a reading, a price or a "now" line without its line is an incomplete field, and the band is hidden; the page never words a figure
  const ln = x => typeof x === "string" && x.trim().length > 0;
  if (c.mileage != null && !ln(c.mileageLine)) return null;
  if (p.mileage != null && !ln(p.mileageLine)) return null;
  if (f.kind === "sold" && !ln(p.priceLine)) return null;
  if (f.mileageWords != null && c.mileage != null && p.mileage != null && !ln(f.nowLine)) return null;
  return f;
}
export function featuredHistoryHtml(fh, opts) {
  const f = featuredHistoryOf(fh, opts); if (!f) return "";
  const c = f.current, p = f.previous, sold = f.kind === "sold", now = typeof f.mileageWords === "string" && f.mileageWords.trim() && c.mileage != null && p.mileage != null && typeof f.nowLine === "string" ? f.nowLine : "";
  const up = "&#8599;";   // the modal's own small arrow
  // COMPACT (Sam, Nov 6 2026): one band below the three columns. The label is the engine's kind ("SOLD BEFORE" or "LISTED BEFORE"); every other word and figure is the engine's field as given.
  return `<section class="fh wrap" aria-label="A car with a history" data-featured-history="${esc(f.kind)}"><div class="fh-card">
<a class="fh-photo" href="${esc(c.url)}" target="_blank" rel="noopener" aria-label="View this auction: ${esc(c.title)}"><img src="${esc(c.photo)}" alt="${esc(c.title + ", live at auction on " + c.platform)}" loading="eager" referrerpolicy="no-referrer"></a>
<div class="fh-ct"><div class="fh-live t-eyebrow">Live auction</div><h3 class="t-h3">${esc(c.title)}</h3><p class="fh-pl">${esc(c.platform)}</p><a class="fh-view" href="${esc(c.url)}" target="_blank" rel="noopener">View this auction</a></div>
<div class="fh-prev"><h2 class="fh-k t-eyebrow">${sold ? "SOLD BEFORE" : "LISTED BEFORE"}</h2><p class="fh-m">${sold ? "" : "Listed "}${esc(p.date)} &middot; ${esc(p.platform)}${p.mileage != null ? " &middot; " + esc(p.mileageLine) : ""}</p>${sold ? `<a class="fh-price" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.priceLine)} ${up}</a>` : `<p class="fh-nosale">No completed sale confirmed</p>`}${now ? `<p class="fh-m fh-now">${esc(now)}</p>` : ""}
<p class="fh-take">${esc(f.take)}</p><a class="fh-hist" href="${esc(p.historyUrl)}">See this car's auction history ${up}</a></div>
<a class="fh-pp" href="${esc(p.url)}" target="_blank" rel="noopener" aria-label="The earlier listing"><img src="${esc(p.photo)}" alt="${esc(c.title + ", at its earlier " + (sold ? "sale" : "listing") + " in " + p.date)}" loading="eager" referrerpolicy="no-referrer"></a></div></section>`;
}

// One icon set: 24 grid, 1.5 stroke, round caps. Sizes come from the CSS, never from the markup.
const IC = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20.5 20.5"/></svg>',
  chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V11M9.5 20V5M15 20v-6.5M20 20V8M3 20h18"/></svg>',
  tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12.2V4.5h7.7l9.3 9.3-7.7 7.7-9.3-9.3z"/><circle cx="7.8" cy="8.8" r="1.1"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  go: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13.5 6.5L19 12l-5.5 5.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13.5 6.5L19 12l-5.5 5.5"/></svg>'
};

// ---- the shared design system: tokens, type styles, header, search, pills, footer (every rule here applies to BOTH pages)
const CSS = `
:root{
 --forest:#0B3126;--forest-hover:#164536;--forest-line:rgba(255,255,255,.14);
 --ink:#15201A;--sec:#5B665F;--cream:#F8F4EC;--card:#FCFAF5;--line:#DDD8CB;--tint:#E8EFEA;--foot:#1D2421;
 --sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif;
 --gut:40px;--maxw:1440px;--hdr:76px;--r-ctl:10px;--r-box:14px;--r-pill:999px}
*{box-sizing:border-box}html,body{margin:0}
/* ONE FULL HEIGHT COLUMN (Nov 8 2026): header, main that grows, footer at the bottom of the viewport when the content is short and after the content when it is long. Every preview page takes it from here. */
body{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column}body>*{width:100%}body>.ft{margin-top:auto}
body{background:var(--cream);color:var(--ink);font:400 16px/1.5 var(--sans);-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit}svg{width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;flex:none}
:focus-visible{outline:2px solid var(--forest);outline-offset:2px}.gh :focus-visible,.hero :focus-visible,.ft :focus-visible{outline-color:#fff}
.wrap{max-width:var(--maxw);margin:0 auto;padding-left:var(--gut);padding-right:var(--gut)}
/* type styles: the only sizes on the pages */
.t-hero{font:500 clamp(36px,4.4vw,58px)/1.06 var(--serif);letter-spacing:-.015em}
.t-title{font:500 40px/1.1 var(--serif);letter-spacing:-.01em}
.t-h2{font:500 clamp(30px,3.4vw,46px)/1.1 var(--serif);letter-spacing:-.012em}
.t-h3{font:500 28px/1.15 var(--serif)}
.t-eyebrow{font:600 12.5px/1.3 var(--sans);letter-spacing:.14em;text-transform:uppercase}
.t-lead{font:400 20px/1.4 var(--sans)}
.t-body{font:400 15.5px/1.5 var(--sans)}
/* header */
.gh{background:var(--forest);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.1)}
.gh .wrap{display:flex;align-items:center;gap:20px;height:var(--hdr)}
.wm{display:inline-flex;align-items:center;gap:10px;color:#fff;text-decoration:none;white-space:nowrap}
.wm b{font:500 30px/1 var(--serif);letter-spacing:-.01em}
.beta{display:inline-block;padding:3px 8px 4px;border:1px solid rgba(255,255,255,.4);border-radius:var(--r-pill);font:500 10.5px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.82)}
.tabs{display:flex;align-items:center;gap:4px;margin-left:auto}
.tabs a{display:inline-flex;align-items:center;white-space:nowrap;height:38px;padding:0 14px;border-radius:var(--r-ctl);color:rgba(255,255,255,.94);text-decoration:none;font:500 15.5px/1 var(--sans);transition:background .15s}
.tabs a:hover{background:rgba(255,255,255,.1)}.tabs a:active{background:rgba(255,255,255,.16)}
.tabs a[aria-current]{background:var(--cream);color:var(--forest)}
.tabs a.acct{margin-left:8px;border:1px solid rgba(255,255,255,.45)}
.tabs a.acct:hover{border-color:#fff}
/* search: one component */
.sb{display:flex;align-items:center;gap:8px;width:100%;height:64px;background:#fff;border:1px solid var(--line);border-radius:var(--r-box);padding:0 10px 0 20px;box-shadow:0 1px 2px rgba(11,49,38,.08),0 6px 18px rgba(11,49,38,.06)}
.sb:focus-within{border-color:var(--forest);box-shadow:0 0 0 3px rgba(11,49,38,.14)}
.sb .ico{display:inline-flex;font-size:22px;color:var(--ink)}
.sb input{flex:1;min-width:0;height:100%;border:0;outline:0;background:transparent;font:400 17px/1.3 var(--sans);color:var(--ink)}
.sb input::placeholder,.sb textarea::placeholder{color:var(--sec);opacity:1}
/* a long example (the Tasks box) is a one row text area that shows its placeholder on two lines where the width needs it */
.sb textarea{flex:1;min-width:0;height:1.3em;box-sizing:content-box;padding:0;margin:0;border:0;outline:0;resize:none;overflow:hidden;background:transparent;font:400 17px/1.3 var(--sans);color:var(--ink)}
.sb .mic{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;margin-right:2px;border:0;border-radius:var(--r-ctl);background:transparent;color:var(--ink);font-size:21px;cursor:pointer}
.sb .mic:hover{background:var(--tint)}
.sb .go{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border:0;border-radius:var(--r-ctl);background:var(--forest);color:#fff;font-size:22px;cursor:pointer}
.sb .go:hover{background:var(--forest-hover)}.sb .go:active{transform:translateY(1px)}
/* pills: one component, colours set by where it sits */
.pills{display:flex;flex-wrap:wrap;align-items:center;gap:10px;--p-bg:var(--tint);--p-ink:var(--forest);--p-line:#C9D6CD;--p-lbl:var(--sec)}
.pills .lbl{font:500 14px/1 var(--sans);color:var(--p-lbl);margin-right:2px}
.pill{display:inline-flex;align-items:center;height:36px;padding:0 15px;border-radius:var(--r-pill);border:1px solid var(--p-line);background:var(--p-bg);color:var(--p-ink);font:400 14.5px/1 var(--sans);text-decoration:none;white-space:nowrap;transition:background .15s,border-color .15s}
.pill:hover{border-color:var(--p-ink)}.pill:active{opacity:.85}
/* footer */
.ft{background:var(--foot);color:#fff}
.ft .wrap{display:flex;align-items:center;gap:36px;min-height:76px;padding-top:18px;padding-bottom:18px}   /* a footer is at most 90px tall on a desktop screen (previewShellCheck) */
.ft .wm{padding-right:36px;border-right:1px solid rgba(255,255,255,.22);align-self:stretch}
.ft nav{display:flex;flex-wrap:wrap;gap:10px 34px}
.ft nav a{color:rgba(255,255,255,.92);text-decoration:none;font:400 15px/1.3 var(--sans)}.ft nav a:hover{text-decoration:underline;text-underline-offset:4px}
.ft .cp{margin-left:auto;font:400 14px/1.3 var(--sans);color:rgba(255,255,255,.7);white-space:nowrap}
@media (max-width:1040px){.pills .lbl{display:none}}
@media (max-width:860px){
 :root{--gut:20px;--hdr:auto}
 .gh .wrap{flex-wrap:wrap;gap:6px 12px;padding-top:14px;padding-bottom:10px}.wm b{font-size:26px}
 .tabs{margin-left:0;width:100%;gap:0;justify-content:space-between}.tabs a{height:36px;padding:0 9px;font-size:14.5px}.tabs a.acct{margin-left:0}
 .sb:has(textarea){height:64px}.sb textarea{height:2.6em;font-size:13.5px}
 .sb{height:58px;padding:0 6px 0 12px;gap:3px}.sb .ico{font-size:18px}.sb input{font-size:13px}.sb .mic{width:32px;margin-right:0;font-size:19px}.sb .go{width:40px;height:40px}
 .ft .wrap{flex-direction:column;align-items:flex-start;gap:20px;padding-top:28px;padding-bottom:28px}.ft .wm{width:100%;padding:0 0 18px;border:0;border-bottom:1px solid rgba(255,255,255,.22)}.ft nav{gap:10px 22px}.ft .cp{margin-left:0}
}`;

// ---- Homepage
const HOME_CSS = `
.hero{position:relative;background:var(--forest);color:#fff;overflow:hidden}
.hero .photo{position:absolute;top:0;right:0;bottom:0;width:58%;background:center right/auto 100% no-repeat;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 42%),linear-gradient(180deg,transparent 0,#000 14%);-webkit-mask-composite:source-in;mask-image:linear-gradient(90deg,transparent 0,#000 42%),linear-gradient(180deg,transparent 0,#000 14%);mask-composite:intersect}
.hero .wrap{position:relative;padding-top:52px;padding-bottom:60px}
.hero h1{margin:0;max-width:700px}
.hero .sub{margin:18px 0 30px;color:rgba(255,255,255,.92)}
.hero .sb,.hero .pills{max-width:720px}
.hero .pills{margin-top:18px;--p-bg:rgba(255,255,255,.06);--p-ink:#fff;--p-line:rgba(255,255,255,.5);--p-lbl:rgba(255,255,255,.9)}
.hero .pill:hover{background:rgba(255,255,255,.14)}
.ways{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;padding-top:32px;padding-bottom:32px}
.way{display:grid;grid-template-columns:34px minmax(0,1fr);column-gap:16px;align-items:start;padding:22px 26px 24px;text-decoration:none;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:14px;transition:background .15s,border-color .15s}
.way .ic{font-size:28px;color:var(--forest);line-height:1;padding-top:3px}
.way h2{margin:0 0 6px;font-size:26px;line-height:1.15}.way p{margin:0;color:var(--sec);max-width:30ch}
.way:hover{background:#fff;border-color:var(--forest)}.way:hover h2{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:6px}
.fh{padding-top:4px;padding-bottom:36px}
.fh-card{display:grid;grid-template-columns:220px minmax(0,1fr) minmax(0,1.1fr) 120px;gap:22px 28px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 22px 16px 16px}
.fh-photo{display:block;border-radius:10px;overflow:hidden;background:#E6E2D8;aspect-ratio:3/2}.fh-photo img{display:block;width:100%;height:100%;object-fit:cover}
.fh-live{color:var(--forest);margin-bottom:4px}.fh-ct h3{margin:0;font-size:22px}.fh-pl{margin:2px 0 8px;color:var(--sec);font:400 15px/1.4 var(--sans)}
.fh-view{font:500 14.5px/1.2 var(--sans);color:var(--forest);text-underline-offset:4px}.fh-view:hover{color:var(--forest-hover)}
.fh-prev{padding-left:28px;border-left:1px solid var(--line);min-width:0}.fh-k{margin:0 0 6px;color:var(--forest)}
.fh-m{margin:0 0 4px;color:var(--sec);font:400 15.5px/1.35 var(--sans)}
.fh-price{display:inline-block;margin:2px 0 6px;font:600 22px/1.2 var(--sans);color:var(--ink);text-decoration:none}.fh-price:hover{color:var(--forest)}
.fh-nosale{margin:4px 0 6px;font:500 16px/1.35 var(--sans);color:var(--ink)}
.fh-now{margin-top:2px;font-size:14.5px}
.fh-pp{display:block;width:120px;aspect-ratio:3/2;border-radius:9px;overflow:hidden;background:#E6E2D8}.fh-pp img{display:block;width:100%;height:100%;object-fit:cover}
.fh-take{margin:2px 0 4px;color:var(--ink);font:400 14.5px/1.4 var(--sans)}
.fh-hist{display:inline-block;margin-top:6px;font:500 15px/1.2 var(--sans);color:var(--forest);text-underline-offset:5px}.fh-hist:hover{color:var(--forest-hover)}
.how{display:grid;grid-template-columns:1.15fr repeat(4,1fr);padding-top:8px;padding-bottom:84px}
.how .hd{padding-right:36px}.how .eb{color:var(--forest)}
.how h2{margin:12px 0 0;max-width:20ch;font-size:clamp(26px,2.3vw,32px);line-height:1.18}
.rule{padding:2px 26px 0;border-left:1px solid var(--line)}
.rule .n{font:500 36px/1 var(--serif);color:var(--forest)}.rule h3{margin:12px 0 8px;font:600 18px/1.3 var(--sans)}.rule p{margin:0;color:var(--sec)}
@media (max-width:1180px){
 .how{grid-template-columns:repeat(2,1fr);row-gap:34px}.how .hd{grid-column:1/-1;padding:0}.how h2{max-width:none}.rule:nth-of-type(even){border-left:0;padding-left:0}
 .fh-card{grid-template-columns:200px minmax(0,1fr) 110px}.fh-prev{grid-column:1/-1;grid-row:2;padding:14px 0 0;border-left:0;border-top:1px solid var(--line)}.fh-pp{grid-column:3;grid-row:1;width:110px}
 .hero .photo{top:auto;height:190px;width:100%;background-position:right bottom;background-size:cover;-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 55%);mask-image:linear-gradient(180deg,transparent 0,#000 55%);-webkit-mask-composite:initial;mask-composite:initial}.hero .wrap{padding-bottom:210px}
 .ft nav{gap:10px 22px}}
@media (max-width:860px){.ways{grid-template-columns:1fr;gap:0}.way p{max-width:none}}
@media (max-width:860px){
 .hero .photo{height:150px}
 .hero .wrap{padding-top:30px;padding-bottom:170px}.hero h1 br{display:none}.hero .sub{font-size:17px;margin:14px 0 22px}
 .hero .pills .lbl{width:100%}
 .ways{padding-top:20px;padding-bottom:16px;gap:12px}.way h2{font-size:26px}
 .fh{padding-bottom:28px}.fh-card{grid-template-columns:104px minmax(0,1fr);gap:14px 16px;padding:12px}.fh-ct h3{font-size:19px}.fh-pp{display:none}.fh-price{font-size:21px}.fh-m{font-size:15px}
 .how{padding-bottom:56px;grid-template-columns:1fr}.rule,.rule:nth-of-type(even){border-left:0;padding:18px 0 0;border-top:1px solid var(--line)}
}`;

// ---- Find: "A few cars Sam found" (Sam, Nov 6 and Nov 8 2026). THE CARD IS THE REAL FIND CARD (lib/preview/realCards.js: Find's own client card(l), the one the live results draw), fed an ENGINE CARD per example, the object /api/buySearch returns for that listing.
// NEEDED FROM LANE B (docs/lane-notes.md): findExamples = [ { card } ] or { cars: [ { card } ], fallback: [ { card } ] }. A live example's card carries a live end_time and its bid; a fallback card is the same object for a completed sale with l.sold = { price, when } (the engine's words), which the card prints as SOLD FOR where the bid badge goes.
// The page draws nothing of its own: a row is the live cars first, then the fallback cards, up to three; an item with no usable engine card is dropped; with none left the section is absent.
const fxStr = x => typeof x === "string" && x.trim().length > 0;
const BAD_WORDS = /\b(?:worth|valuation|valued|estimate[ds]?|appraisal|undervalued|overvalued|bargain|steal|cheap)\b/i;
export function findExamplesPartsOf(field) {
  if (Array.isArray(field)) return { cars: field, fallback: [] };
  if (field && typeof field === "object") return { cars: Array.isArray(field.cars) ? field.cars : [], fallback: Array.isArray(field.fallback) ? field.fallback : [] };
  return { cars: [], fallback: [] };
}
// the engine card is usable when it can be drawn honestly: an id, a title, a source, the auction link, a real photo; live needs an end in the future, a sale needs its price and date words
export function engineCardOf(item, kind, { now = NaN, allowData = false } = {}) {
  const c = item && typeof item === "object" && item.card && typeof item.card === "object" ? item.card : null; if (!c) return null;
  if (c.id == null || !fxStr(c.title) || !fxStr(c.source) || !httpsUrl(c.url) || !httpsUrl(c.photo_url, allowData)) return null;
  if (kind === "live") return Number.isFinite(Date.parse(c.end_time)) && Date.parse(c.end_time) > now && !c.sold ? c : null;
  const s = c.sold; return s && typeof s === "object" && fxStr(s.price) && fxStr(s.when) && !BAD_WORDS.test(s.price + " " + s.when) ? c : null;
}
// THE FIND LANDING ROW (Sam, Nov 8 2026, final): "A few cars currently at auction". Each example is the real Find card with the rest of it hidden (CSS): the real photo, the car's own title and the platform tag, and the Sold before label when the engine's card carries one; no bid badge, no SAM block, no range, no spec chips,
// no See the sales. The whole card is one link to that car's Find result: the engine's findUrl, else the plain Find search for the card's own title. THE ROW NEVER GOES EMPTY (Sam: a blank row is worse than a sold car): the live cars first, then, when fewer than three qualify, the engine's fallback sales (Lane B, the same card ended, card.sold = { price, when }) up to three; a sale's tag reads "Sold".
export function findRowOf(field, opts) {
  const { cars, fallback } = findExamplesPartsOf(field);
  const live = cars.map(i => { const c = engineCardOf(i, "live", opts); return c ? { c, live: true, item: i, findUrl: findUrlOf(i, c) } : null; }).filter(Boolean).slice(0, 3);
  const sold = fallback.map(i => { const c = engineCardOf(i, "sold", opts); return c ? { c, live: false, item: i, findUrl: findUrlOf(i, c) } : null; }).filter(Boolean).slice(0, 3 - live.length);
  return [...live, ...sold];
}
const findUrlOf = (item, c) => typeof item.findUrl === "string" && /^\/(?:find|buy)(?:[?#]|$)/.test(item.findUrl) && !/^\/\//.test(item.findUrl) ? item.findUrl : "/find?q=" + encodeURIComponent(String(c.title));
// THE LANDING CARD (Sam's mockup, Nov 8 2026, final): a white card, the car's real photo cropped 16:9 with rounded corners, the title in bold sans, the platform in small muted text, then ONE discreet link line: "Sold before · See its history \u2197" when the engine says the car sold before, else "Explore this car \u2197". No bid, no chips, no SAM block, no buttons;
// the whole card is one link to the car's Find result. It is made ONLY from the engine card's own fields: the photo (card.photo_url), the title (card.title), the platform (card.source); which link line it prints is the verdict of the REAL Find card (lib/findCardKit.js card(l): its history chip reads "Sold before" or "Listed before"), never a rule of the page.
const FIND_DRAW = 'var g=document.getElementById("fx-grid"),L=JSON.parse(document.getElementById("fx-data").textContent);if(g&&window.GASCARD){var mk=function(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;};L.forEach(function(o){var probe=document.createElement("div");probe.innerHTML=window.GASCARD.card(o.card);var h=probe.querySelector(".hchip"),sold=!!h&&/^Sold before/i.test(h.textContent.trim());var a=mk("a","lc");a.href=o.findUrl;a.setAttribute("aria-label",o.card.title+": see it in Find");var ph=mk("span","lc-ph"),im=document.createElement("img");im.src=o.card.photo_url;im.alt="";im.loading="lazy";im.referrerPolicy="no-referrer";ph.appendChild(im);a.appendChild(ph);a.appendChild(mk("span","lc-t",o.card.title));a.appendChild(mk("span","lc-p",o.card.source));var l=mk("span","lc-l",sold?"Sold before \u00b7 See its history \u2197":"Explore this car \u2197");if(sold)l.setAttribute("data-sold","1");a.appendChild(l);g.appendChild(a);});}';
// THE FIND LIVE ROW, FINAL (Sam's brief, Nov 9 2026): three live cars, each the real photo, the car's own title, the venue and the timing line, and ONE slim pale green intelligence row from Lane B's intelligence field (Sold before with the recorded price, Market range with the band,
// Listed before with the month; kind none draws no row). Every word is a string the engine sent or a reason table line; the page draws it and adds nothing. The card opens the car's Find result; the intelligence row opens what it names (the car's history, or its Market Check).
const INTEL_KINDS = ["sold_before", "market_range", "listed_before"];
const intelOf = it => { const i = it && typeof it === "object" ? it.intelligence : null; return i && INTEL_KINDS.includes(i.kind) && fxStr(i.line) && typeof i.url === "string" && /^\/[^/]/.test(i.url) ? i : null; };
const intelHref = u => u.replace(/^\/market-check\?/, "/preview/market-check?");
export function findExamplesHtml(field, opts) {
  const row = findRowOf(field, opts); if (!row.length) return { html: "", scripts: "" };
  const label = row.some(r => r.live) ? reasonLine("entry.find_live") : reasonLine("entry.find_sold");
  const card = r => { const c = r.c, i = r.live ? intelOf(r.item) : null, venue = r.live && fxStr(r.item.venue) ? r.item.venue : c.source, when = r.live ? (fxStr(r.item.timing) ? r.item.timing : "") : reasonLine("entry.find_sold");
    return `<div class="lc"><a class="lc-main" href="${esc(r.findUrl)}" aria-label="${esc(c.title)}: see it in Find"><span class="lc-ph"><img src="${esc(c.photo_url)}" alt="" width="640" height="360" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span><span class="lc-t">${esc(c.title)}</span><span class="lc-p">${esc([venue, when].filter(Boolean).join(" \u00b7 "))}</span></a>${i ? `<a class="lc-i" data-intel="${esc(i.kind)}" href="${esc(intelHref(i.url))}">${esc(i.line)}</a>` : ""}<a class="lc-v" data-view-auction href="${esc(c.url)}" target="_blank" rel="noopener">${esc(ENTRY_BRIEF_COPY.viewAuction)}</a></div>`; };
  const html = `<section class="proof fx" aria-label="${esc(label)}" data-find-examples="${row.length}"${row.some(r => !r.live) ? ' data-fallback="' + row.filter(r => !r.live).length + '"' : ""}><h2 class="xeyebrow xe-c">${esc(label)}</h2><div class="fx-grid" id="fx-grid">${row.map(card).join("")}</div></section>`;
  return { html, scripts: "" };
}

// ---- Find
const FX_CARD_CSS = `.fx-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
@media (max-width:1100px){.fx-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:640px){.fx-grid{grid-template-columns:1fr}}
.lc{display:flex;flex-direction:column;gap:10px;min-width:0;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:8px 8px 10px;box-shadow:0 1px 2px rgba(11,49,38,.05)}
.lc:hover{border-color:#B9C8BE;box-shadow:0 4px 14px rgba(11,49,38,.08)}
.lc-main{display:flex;flex-direction:column;gap:2px;color:var(--ink);text-decoration:none;min-width:0}.lc-main:focus-visible,.lc-i:focus-visible{outline:2px solid var(--forest);outline-offset:2px;border-radius:12px}
.lc-ph{display:block;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#E6E2D8}.lc-ph img{display:block;width:100%;height:100%;object-fit:cover}
.lc-t{display:block;margin:10px 6px 0;font:700 17px/1.3 var(--sans)}.lc-p{display:block;margin:0 6px;color:var(--sec);font:400 14px/1.35 var(--sans)}
.lc-i{display:block;margin:auto 6px 0;padding:10px 12px;border-radius:10px;background:var(--tint);color:var(--forest);text-decoration:none;font:600 15px/1.3 var(--sans)}.lc-i:hover{background:#DCE8E0}
/* View auction: the Tasks email card's button (13px, 8px radius, the dark fill, white words), small, under the intelligence row or in its place on a plain card */
.lc-v{align-self:flex-start;margin:auto 6px 0;padding:7px 12px;border-radius:8px;background:var(--forest);color:#fff;text-decoration:none;font:600 13px/20px var(--sans)}.lc-v:hover{background:var(--forest-hover,#164536)}.lc-v:focus-visible{outline:2px solid var(--forest);outline-offset:2px}.lc-i~.lc-v{margin-top:0}`;

// THE ONE ENTRY HERO of Find, Market Check and Sell (Sam's final brief, Nov 9 2026): eyebrow (Market Check and Sell), headline, one line, the shared search box, the chips. Every word is a reason table line.
const ENTRY_COPY = { find: { title: "entry.find_title", line: "entry.find_line" }, mc: { eyebrow: "entry.mc_eyebrow", title: "entry.mc_title", line: "entry.hero_mc_line" }, sell: { eyebrow: "entry.sell_eyebrow", title: "entry.sell_title", line: "entry.hero_sell_line" } };
const entryHero = (kind, box, chips) => { const c = ENTRY_COPY[kind]; return `<div class="stage">${c.eyebrow ? `<p class="eyebrow">${esc(reasonLine(c.eyebrow))}</p>` : ""}<h2 class="t-h2">${esc(reasonLine(c.title))}</h2><p class="elead">${esc(reasonLine(c.line))}</p>${box}${chips}</div>`; };
const entryPlaceholder = kind => ENTRY_BRIEF_COPY[kind].placeholder;
const ENTRY_CSS = `
.xeyebrow{margin:0 0 14px;color:var(--forest);font:600 12.5px/1.3 var(--sans);letter-spacing:.14em;text-transform:uppercase}.xe-c{text-align:center}
.eyebrow{margin:0 0 14px;color:var(--forest);font:600 12.5px/1.3 var(--sans);letter-spacing:.14em;text-transform:uppercase}
.elead{margin:-8px auto 26px;max-width:700px;text-wrap:balance;color:var(--sec);font:400 18px/1.45 var(--sans)}
/* the landing pages carry no rail (Nov 2026): one column, the content centred in the full page width; the results pages keep the rail and these rules do not touch them */
.shell.entry{grid-template-columns:minmax(0,1fr)}.shell.wrap.entry{padding-right:28px}
.entry .main{padding-bottom:70px}.entry .stage{flex:none;justify-content:flex-start;padding:64px 0 30px}.entry .deco{display:none}
.proof{position:relative;z-index:1;width:100%;max-width:1040px;margin:0 auto}
@media (max-width:860px){.shell.wrap.entry{padding-right:var(--gut)}.entry .stage{padding:34px 0 24px}.elead{margin-top:-4px}}`;
const FIND_CSS = `
.sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.shell{--rail:200px;display:grid;grid-template-columns:var(--rail) minmax(0,1fr)}
.rail{border-right:1px solid var(--line);padding:24px 16px 28px 0;min-width:0;width:var(--rail);box-sizing:border-box}   /* the divider is this box's own right border and the column is the same variable, so the rule can never sit anywhere but the rail's edge (Sam, Nov 8: at 2000px it read about 320) */   /* the rail's content starts where the header's logo starts: the shell is inside the same .wrap, so both take the gutter from one rule */
.new{display:inline-flex;align-items:center;justify-content:flex-start;gap:8px;height:38px;max-width:100%;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:0 12px;border-radius:var(--r-ctl);background:var(--forest);color:#fff;text-decoration:none;font:500 15px/1 var(--sans)}
.new:hover{background:var(--forest-hover)}.new:active{transform:translateY(1px)}.new svg{font-size:15px;stroke-width:2}
.rh{margin:28px 0 8px 10px;font:600 11.5px/1.3 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--sec)}
.rail .list{display:grid;grid-template-columns:minmax(0,1fr);gap:2px}
.it{display:flex;align-items:center;gap:11px;height:38px;padding:0 10px;border-radius:8px;text-decoration:none;color:var(--ink);font:400 14.5px/1 var(--sans)}
.it svg{font-size:15px;color:#8C968F;stroke-width:1.4}.it span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.it:hover{background:var(--tint)}
.shell.wrap{padding-right:0}   /* the content area runs from the rail's rule to the right edge, so the question is centred in it, not in the viewport */
.main{position:relative;padding:0 40px 36px;display:flex;flex-direction:column;min-width:0}
.stage{flex:1 1 auto;display:flex;flex-direction:column;justify-content:center;width:100%;max-width:900px;margin:0 auto;padding:40px 0 36px;text-align:center}   /* centred in the content beside the rail, and raised about 50px from the old 48/24 centring */
.stage h2{margin:0 0 26px;color:var(--forest)}.stage .sb{width:100%;max-width:760px;margin-left:auto;margin-right:auto}.main:not(.has-fx){padding-bottom:150px}
.stage .pills{justify-content:center;margin-top:20px}
.deco{position:absolute;right:0;bottom:0;z-index:0;pointer-events:none;width:min(26%,300px);aspect-ratio:676/290;margin:0;opacity:.5;background:center/cover no-repeat;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 55%),linear-gradient(180deg,transparent 0,#000 38%);-webkit-mask-composite:source-in;mask-image:linear-gradient(90deg,transparent 0,#000 55%),linear-gradient(180deg,transparent 0,#000 38%);mask-composite:intersect;pointer-events:none}
.fx{position:relative;z-index:1;width:100%;max-width:1040px;margin:0 auto;padding:0}.fx-err p{margin:0;color:var(--sec);font:400 15px/1.5 var(--sans)}.fx-h{margin:0 0 12px;text-align:left;color:var(--sec);font:600 14px/1.3 var(--sans);letter-spacing:.02em}
.gh .wrap,.ft .wrap,.shell.wrap{max-width:none;padding-left:28px}   /* THE WORKSPACE LAYOUT (Sam, Nov 6 2026): the logo and "+ New search" sit in one 28px left gutter, from this one rule; the right side keeps the page's own edge so the top right nav does not move; the footer wordmark takes the same gutter. Find's stylesheet only, the Home page and the others keep the 40px wrap */
.gh .wrap,.ft .wrap,.shell.wrap{padding-right:max(var(--gut),calc((100% - var(--maxw)) / 2 + var(--gut)))}
.shell.wrap{padding-right:0}
.main.has-fx .stage{flex:none;justify-content:flex-start;padding:44px 0 28px}.main.has-fx .deco{display:none}.stage{position:relative;z-index:1}
@media (max-width:1100px){.main{padding:0 28px 36px}.main:not(.has-fx){padding-bottom:130px}.deco{width:min(30%,260px)}}
@media (max-width:860px){
 .gh .wrap,.ft .wrap{max-width:var(--maxw);padding-left:var(--gut);padding-right:var(--gut)}.shell.wrap{max-width:var(--maxw);padding-left:var(--gut)}
 .shell{grid-template-columns:1fr}.rail{order:2;border-right:0;border-top:1px solid var(--line);padding:22px 0 28px}
 .shell.wrap{padding-right:var(--gut)}.main{padding:0 0 44px}.stage,.main.has-fx .stage{padding:34px 0 24px}.stage h2{margin-bottom:18px}.stage .pills{justify-content:flex-start;margin-top:16px}.stage .pills .lbl{display:none}
 .deco{display:none}
}`+ENTRY_CSS;

const SEARCH_JS = `(function(){
 var f=document.getElementById("pq-form");
 if(f){
  if(!f.hasAttribute("data-own"))f.addEventListener("submit",function(e){e.preventDefault();var q=document.getElementById("pq").value.trim();if(!q)return;location.href="/find?q="+encodeURIComponent(q);});
  var m=document.getElementById("pq-mic"),R=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(m){if(!R){m.hidden=true;}else{m.addEventListener("click",function(){try{var r=new R();r.lang="en-US";r.onresult=function(ev){document.getElementById("pq").value=ev.results[0][0].transcript;};r.start();}catch(x){}});}}
 }
 try{var s=JSON.parse(localStorage.getItem("gas_auth_session")||"null");if(s&&s.access_token){var a=document.getElementById("acct");if(a){a.setAttribute("href","/tasks/mine");}}}catch(e){}
 (function(){var fh=document.querySelector(".fh");if(!fh)return;var gone=false,hide=function(){if(gone)return;gone=true;fh.parentNode&&fh.parentNode.removeChild(fh);};fh.querySelectorAll("img").forEach(function(i){i.addEventListener("error",hide);if(i.complete&&i.naturalWidth===0)hide();});})();
 var rail=document.getElementById("rail-recent");
 if(rail){try{var sg=JSON.parse(localStorage.getItem("gas_auth_session")||"null");if(!(sg&&sg.access_token))throw 0;var l=JSON.parse(sessionStorage.getItem("gas_recent_s")||"[]").filter(function(x){return x&&typeof x.url==="string"&&x.url.charAt(0)==="/"&&x.url.charAt(1)!=="/"&&x.label;}).slice(0,6);
  if(l.length){var hd=document.getElementById("rail-head");hd.textContent="Recent searches";hd.hidden=false;rail.innerHTML="";l.forEach(function(x){var a=document.createElement("a");a.className="it";a.href=x.url;a.title=x.label;a.innerHTML=rail.getAttribute("data-ic");var s=document.createElement("span");s.textContent=x.label;a.appendChild(s);rail.appendChild(a);});}}catch(e){}}
})();`;

// ---- the shared parts
const header = active => `<header class="gh"><div class="wrap"><a class="wm" href="/"><b>GoAskSam</b><span class="beta">Beta</span></a><nav class="tabs" aria-label="Main"><a href="/find"${active === "find" ? ' aria-current="page"' : ""}>${copyText("rail.NAV_FIND")}</a><a href="/market-check"${active === "market-check" ? ' aria-current="page"' : ""}>${copyText("rail.NAV_MARKET_CHECK")}</a><a href="/sell"${active === "sell" ? ' aria-current="page"' : ""}>${copyText("rail.NAV_SELL")}</a><a href="/tasks"${active === "tasks" ? ' aria-current="page"' : ""}>${copyText("rail.NAV_TASKS")}</a><a class="acct" id="acct" href="/tasks">Account</a></nav></div></header>`;
const searchBox = (own, placeholder, o = {}) => `<form class="sb" id="pq-form" role="search" action="${esc(o.action || "/find")}" method="get"${own || o.action ? " data-own" : ""}><span class="ico" aria-hidden="true">${IC.search}</span>${placeholder ? `<textarea id="pq" name="q" rows="1" autocomplete="off" placeholder="${esc(placeholder)}" aria-label="${esc(copy("home.START_LABEL"))}"></textarea>` : `<input id="pq" name="${esc(o.name || "q")}" type="text" autocomplete="off" placeholder="${esc(o.placeholder || PLACEHOLDER)}" aria-label="${esc(copy("home.START_LABEL"))}">`}<button type="button" class="mic" id="pq-mic" aria-label="Speak your search">${IC.mic}</button><button class="go" type="submit" aria-label="Go ask Sam">${IC.go}</button></form>`;
const footer = () => `<footer class="ft"><div class="wrap"><a class="wm" href="/"><b>GoAskSam</b></a><nav aria-label="Footer"><a href="/about">${copyText("rail.FOOT_ABOUT")}</a><a href="/business">${copyText("rail.FOOT_BUSINESS")}</a><a href="${DAILY_VROOM}" target="_blank" rel="noopener">${copyText("rail.FOOT_DAILY_VROOM")}</a><a href="/whats-new">${copyText("rail.FOOT_WHATS_NEW")}</a><a href="/feedback">${copyText("rail.FOOT_FEEDBACK")}</a><a href="/terms">${copy("home.LEGAL_TERMS")}</a><a href="/privacy">${copy("home.LEGAL_PRIVACY")}</a></nav><span class="cp">&copy; GoAskSam</span></div></footer>`;
const pills = (key = "preview", hrefOf = t => "/find?q=" + encodeURIComponent(t)) => `<div class="pills"><span class="lbl">${esc(ENTRY_BRIEF_COPY.chipsLabel)}</span>${PLACEHOLDERS[key].examples.map(t => `<a class="pill" href="${esc(hrefOf(t))}">${esc(t)}</a>`).join("")}</div>`;
const doc = (title, css, body, extra = "") => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><title>${esc(title)}</title><meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="#0B3126"><link rel="icon" href="/favicon.ico" sizes="any">${FONT_LINKS}<style>${CSS}${css}</style></head><body>${body}<script>${SEARCH_JS}</script>${extra}</body></html>`;

export function homeHtml(opts = {}) {
  const { head, lead, rules } = rulesOf();
  const title = copyText("home.START_TITLE").replace(/^(\S+ \S+ \S+) /, "$1 <br>");
  const way = (ic, h, p, href) => `<a class="way" href="${href}"><span class="ic">${ic}</span><span><h2 class="t-h3">${esc(h)}</h2><p class="t-body">${esc(p)}</p></span></a>`;
  // opts.featuredHistory is for the checks and the screenshots only: the served page calls homeHtml() with nothing, so the section is hidden until Lane B's engine field is read here (and Sam says so in writing).
  const body = `${header("")}
<section class="hero" aria-label="Search"><div class="photo" style="background-image:url(${img("hero-home.jpg")})" aria-hidden="true"></div>
<div class="wrap"><h1 class="t-hero">${title}</h1><p class="sub t-lead">${HERO_SUB}</p>${searchBox()}${pills()}</div></section>
<main><nav class="ways wrap" aria-label="Three ways in">${way(IC.search, copy("rail.NAV_FIND"), WAYS.find, "/find")}${way(IC.chart, copy("rail.NAV_MARKET_CHECK"), WAYS.mc, "/market-check")}${way(IC.tag, copy("rail.NAV_SELL"), WAYS.sell, "/sell")}</nav>
${featuredHistoryHtml(opts.featuredHistory, { allowData: opts.allowData === true, now: opts.now })}
<section class="how wrap" aria-label="${esc(head)}"><div class="hd"><div class="eb t-eyebrow">${esc(head)}</div><h2 class="t-h2">${esc(lead)}</h2></div>${rules.map((r, i) => `<div class="rule"><div class="n">${i + 1}</div><h3>${esc(r.h)}</h3><p class="t-body">${esc(r.b)}</p></div>`).join("")}</section></main>${footer()}`;
  return doc("GoAskSam preview: home", HOME_CSS, body);
}

// The crew route (api/crewPage.js) reads Lane B's engine field with the request's crew cookie and hands it over with the clock; a failed or missing read is null, and null hides the section.
export async function homeHtmlFor(req, { read, now } = {}) {
  let fh = null; try { fh = typeof read === "function" ? await read(req) : null; } catch { fh = null; }
  return homeHtml({ featuredHistory: fh, now });
}

export function findHtml({ examples = null, now = NaN, allowData = false, readError = null } = {}) {
  // The rail's Recent searches are the signed in visitor's own (the script fills them from the browser's saved list); a visitor with none sees no list and no suggestions standing in for one.
  const fxo = findExamplesHtml(examples, { now, allowData }), fx = fxo.html || (readError ? `<section class="fx fx-err" data-could-not-read="find"><p>${esc(readError)}</p></section>` : "");
  const body = `${header("find")}
<div class="shell wrap entry">
<main class="main"><h1 class="sr">${copyText("rail.NAV_FIND")}</h1>
${entryHero("find", searchBox(false, "", { placeholder: entryPlaceholder("find") }), pills("previewFind"))}${fx}</main></div>${footer()}`;
  return doc("GoAskSam preview: Find", FIND_CSS + (fx ? "\n" + FX_CARD_CSS : ""), body, fxo.scripts);
}

export const PREVIEW_PAGES = { "preview-home": homeHtml, "preview-find": findHtml };

// the shared parts, for the other crew previews (Tasks): one header, one search, one footer, one set of tokens, one document shell
export const SHARED = { entryHero, entryPlaceholder, ENTRY_CSS, IC, CSS, esc, header, searchBox, pills, footer, doc, PLACEHOLDER, FIND_CSS, SEARCH_JS };
