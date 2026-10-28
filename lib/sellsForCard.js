// THE SHARED "What these sell for" CARD (Sam, Oct 2026, one engine / one card job). Every product
// (Market Check, Buy, Sell, Tasks, the partner demo) renders this card from the SAME function, so the
// same car reads the same card everywhere. "Better nothing than a fake number" - every number on the
// card comes straight off the engine's own answer object (answer.cluster/poolN/windowMonths/
// setAsideCount/setAsideReasons/stale/staleLine/readAt/trendQuarters, the last from Lane B's e58,
// lib/onebox.js trendFor via mapEngineAnswer), nothing computed, guessed or hand-written here.
//
// Written as ONE self-contained factory function (sellsForCardFactory) with zero outer-scope
// references, so its exact source can be captured with .toString() and run unmodified in the
// browser for Market Check's client-rendered result (public/js/onebox.js). This is the SAME single
// definition in both places - there is no second, hand-copied implementation to drift out of sync.
// Node callers (Buy, Sell, Tasks, the partner demo - all server-rendered) import sellsForCardHtml /
// latestQuarterRowHtml directly; Market Check embeds SELLS_FOR_CARD_JS (see api/marketCheck.js) so
// window.sellsForCardHtml / window.latestQuarterRowHtml exist before js/onebox.js runs.
//
// FOR LANE C (Buy, partner demo) AND LANE D (Tasks, Sell sales count): call
//   sellsForCardHtml(answer, opts)
// with `answer` the engine's own result object (oneBoxFor/runOneBox's return, unmodified - the same
// object Market Check receives from POST /api/sellerDecision) and `opts` optional:
//   { partnerPillsHtml: "<...>" }  - pre-built HTML for the partner pill(s); the card places it
//                                    directly under the headline - the range on a range answer,
//                                    the thin/spread-too-wide text otherwise (the one placement
//                                    rule, every case has a slot, never insert pills anywhere
//                                    else around the card).
// It returns a complete "<div class=\"sfc-card\">...</div>" string, or "" when there is truly
// nothing to show (no range AND zero sales). Include SELLS_FOR_CARD_CSS once per page.
// For the partner demo's full-width trend section, call latestQuarterRowHtml(answer) separately -
// it is NOT part of the card (the quarter line was moved off the card on purpose) and renders ""
// unless the latest quarter clears both its own gates (see the function's own note).
function sellsForCardFactory() {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
  // Named and tunable, per the brief: how far a quarter's midpoint must sit from the main range's
  // midpoint before the quarter line is worth showing at all (otherwise it is just noise next to
  // the range already on the page).
  const QUARTER_MIDPOINT_DIFF_THRESHOLD = 0.05;

  function monD(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return MON[d.getUTCMonth()] + " " + d.getUTCDate();
  }

  function monthYear(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
  }
  // One engine sale row: its photo (or a marked no-photo slot), sale month, price and the mileage at that sale, then
  // the row's own title. Never a venue, never a link. opts.rowPhoto(card) names the photo address (the partner views
  // pass their gated photo path); opts.rowTitles === false leaves the title off (partner views: date, price, mileage,
  // photo only). opts.rows === false leaves the rows to a page that lists the same engine sales itself (the partner
  // views), so no sale shows twice.
  function saleRowHtml(c, o) {
    const src = typeof o.rowPhoto === "function" ? o.rowPhoto(c) : (c.image || null);
    const photo = src ? "<img class=\"sfc-row-img\" src=\"" + esc(src) + "\" alt=\"\" loading=\"lazy\">" : "<span class=\"sfc-row-nophoto\">No photo</span>";
    const mi = !c.milesHidden && Number(c.mi) > 0 ? Math.round(Number(c.mi)).toLocaleString("en-US") + " miles at sale" : "";   // milesHidden (e96): the engine hides a mileage it does not stand behind
    const when = monthYear(c.date);
    const title = o.rowTitles === false ? "" : String(c.title || "").trim();
    return "<li class=\"sfc-row\">" + photo + "<span class=\"sfc-row-text\">" +
      (title ? "<span class=\"sfc-row-title\">" + esc(title) + "</span>" : "") +
      "<span class=\"sfc-row-price\">" + esc(usd(c.price)) + "</span>" +
      "<span class=\"sfc-row-meta\">" + esc([when, mi].filter(Boolean).join(", ")) + "</span>" +
      (c.rangeLabel ? "<span class=\"sfc-row-meta sfc-row-range\">" + esc(c.rangeLabel) + "</span>" : "") + "</span></li>";
  }

  // "{k} set aside: {reasons}." - the engine's own setAsideReasons object (reason -> count), same
  // bucketing lib/onebox.js setAsideReasonFor already produces for every other set-aside surface.
  // Never gated on whether a range exists - a thin answer can still have set-aside rows behind it.
  // k is the SUM of setAsideReasons' own values, never answer.setAsideCount directly - that field
  // comes back word-ified under ten (e.g. "two", confirmed live on the 1957 356 Speedster) and
  // Number() on a word silently fails, which had been dropping this footnote entirely. The reason
  // counts themselves are always real numbers.
  function asideFootnote(answer) {
    const reasons = answer && answer.setAsideReasons;
    if (!reasons || typeof reasons !== "object") return "";
    const bits = [];
    let k = 0;
    // ONE footnote wording on every product and in emails (Sam, Oct 23 2026): "N sales set aside: reasons." (same labels as the Market Check hero)
    const LBL = { modified: ["modified", "modified"], project: ["project car", "project cars"], replica: ["replica or tribute", "replicas or tributes"], "odd sale": ["odd sale", "odd sales"] };
    const SL = answer.setAsideLabels && typeof answer.setAsideLabels === "object" ? answer.setAsideLabels : {};   // the engine's own phrase labels (lib/bulkSale.js)
    const live = Object.keys(reasons).filter(key => Number(reasons[key]) > 0);
    live.forEach(key => {
      const n = Number(reasons[key]) || 0;
      const p = SL[key];
      if (p) bits.push((live.length === 1 ? "" : n + " ") + (n === 1 ? p.one : p.many));
      else { const l = LBL[key] || [key, key]; bits.push(n + " " + (n === 1 ? l[0] : l[1])); }
      k += n;
    });
    if (!bits.length) return "";
    const sentence = k + (k === 1 ? " sale" : " sales") + " set aside: " + bits.join(", ") + ".";
    return "<p class=\"sfc-aside\">" + esc(sentence) + "</p>";
  }

  // The Market Check link's words (Sam, Oct 26 2026): "See all {n} sales in Market Check", n being the very count the basis line prints ("Based on {n} sales",
  // number words under ten as the engine wrote them), read from that line; a phone reads "All {n} sales in Market Check". No count: "See every sale in Market Check".
  // Twin of lib/countNoun.js (countNounCheck fails if they differ); this factory has no outer scope, so it carries its own copy.
  function countNoun(n, one, o) {
    o = o || {};
    var k = Math.round(Number(n)), many = o.many || one + "s", W = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"], out;
    if (!(k >= 1)) out = "no " + many;
    else {
      var num = o.num != null ? String(o.num) : (o.words === false || k > 10 ? k.toLocaleString("en-US") : W[k]);
      out = num + " " + (k === 1 ? one : many);
    }
    return o.cap ? out.charAt(0).toUpperCase() + out.slice(1) : out;
  }
  function marketLabel(d) {
    const m = /^Based on (.+?) sales?\b/.exec(String((d && d.basisLine) || ""));
    const n = m ? m[1] : (Number(d && d.poolN) > 0 ? String(Number(d.poolN)) : "");
    if (!n) return "<span class=\"sfc-long\">See every sale in Market Check</span><span class=\"sfc-short\">Every sale in Market Check</span>";
    if (/^(one|1)$/i.test(String(n))) return "<span class=\"sfc-long\">See the one sale in Market Check</span><span class=\"sfc-short\">The one sale in Market Check</span>";
    return "<span class=\"sfc-long\">See all " + esc(n) + " sales in Market Check</span><span class=\"sfc-short\">All " + esc(n) + " sales in Market Check</span>";
  }

  // THE CARD. Exactly the five pieces in the brief, in order, nothing else.
  // THE OPTIONS (e96, Lane B's page contract docs/e96-page-contract.md): the page prints the engine's own lines and computes nothing.
  //   optionsState alike: the range stays, optionLines (one line per option) print directly under it; split or apart: no pooled number, headlineLines
  //   (one line per option, each with its own range and count) print in its place. optionsNote prints once under the lines. A line is the option's own words,
  //   written by the engine ("Convertible, 5 sales, too few for a range" under the floor). Where the page can act on it (opts.interactive, Market Check),
  //   a line is a button that sends the option's own refine back to the engine unchanged; elsewhere it is plain text.
  //   refineOptions (the other dimensions that also price apart) print as a chip row, never as ranges.
  function optionLinesOf(d) {
    const st = d && d.optionsState;
    const lines = st === "alike" ? d.optionLines : (st === "split" || st === "apart") ? d.headlineLines : null;
    return Array.isArray(lines) ? lines.filter(x => typeof x === "string" && x) : [];
  }
  // E98 (Sam, Oct 28 2026), ONE VISUAL WEIGHT FOR A NUMBER: a range is the large serif figure with its label in small caps above it and its count in small grey sans below; nothing that is a number is a link,
  // underlined or small. Split and apart print one such block per option (side by side on desktop, stacked on a phone); refine chips and an alike state's options are pills in one row under the figures,
  // labelled NARROW BY. partsOf only SPLITS the engine's own option line into its label, range and count: it writes no word and computes no number, and a line it cannot split prints whole.
  function partsOf(t) {
    const s = String(t || "");
    let m = /^(.+?)\s+(\$[\d,]+ to \$[\d,]+),\s+(.+)$/.exec(s);
    if (m) return { label: m[1], range: m[2], count: m[3] };
    m = /^(.+?),\s+(\d[\d,]* sales?),\s+(.+)$/.exec(s);
    return m ? { label: m[1], range: null, count: m[2] + ", " + m[3] } : null;
  }
  function optionRefs(d, o, i) { const opts = Array.isArray(d.options) ? d.options : []; return o.interactive && opts[i] && opts[i].refine ? opts[i] : null; }
  function blocksHtml(d, o) {
    const lines = optionLinesOf(d);
    if (!lines.length) return "";
    return "<div class=\"sfc-blocks\">" + lines.map((t, i) => {
      const p = partsOf(t), r = optionRefs(d, o, i);
      // the engine's whole line is what a screen reader reads (once); the three pieces are the picture
      const inner = p ? "<span class=\"sfc-vis\" aria-hidden=\"true\"><span class=\"sfc-label\">" + esc(p.label) + "</span>" + (p.range ? "<span class=\"sfc-range\">" + esc(p.range) + "</span>" : "") + "<span class=\"sfc-count\">" + esc(p.count) + "</span></span><span class=\"sfc-sr\">" + esc(t) + "</span>" : "<span class=\"sfc-count\">" + esc(t) + "</span>";
      return r ? "<button type=\"button\" class=\"sfc-block sfc-opt-btn\" data-refine=\"" + esc(JSON.stringify(r.refine)) + "\" data-mlabel=\"" + esc(r.label || "") + "\">" + inner + "</button>" : "<div class=\"sfc-block\">" + inner + "</div>";
    }).join("") + "</div>";
  }
  // a pill: the label and its count; the engine's whole line stays in the markup for a screen reader
  function pillHtml(label, n, full, attrs) {
    const inner = "<span aria-hidden=\"true\">" + esc(label) + " <span class=\"sfc-pn\">" + esc(n) + "</span></span>" + (full ? "<span class=\"sfc-sr\"> " + esc(full) + "</span>" : "");
    return attrs ? "<button type=\"button\" class=\"sfc-pill " + attrs.cls + "\" data-refine=\"" + esc(JSON.stringify(attrs.refine || null)) + "\"" + attrs.extra + ">" + inner + "</button>" : "<span class=\"sfc-pill\">" + inner + "</span>";
  }
  // E98 NARROW STRIP (Sam, Oct 28 2026): the pills are NOT part of the answer card. sellsForNarrowHtml is the pills row only; the page draws it in its own strip directly below the card under one NARROW BY heading,
  // with the mileage box. Only an interactive page gets one (the pills act); the card itself keeps an alike state's option lines as screen-reader text where no strip carries them.
  function sellsForNarrowHtml(d, o) {
    o = o || {};
    if (!o.interactive) return "";
    const pills = [];
    if (d && d.optionsState === "alike") optionLinesOf(d).forEach((t, i) => {
      const p = partsOf(t), r = optionRefs(d, o, i), n = p ? (/^\d[\d,]*/.exec(p.count) || [""])[0] : "";
      pills.push(p && n ? pillHtml(p.label, n, t, r ? { cls: "sfc-opt-btn", refine: r.refine, extra: " data-mlabel=\"" + esc(r.label || "") + "\"" } : null) : "<span class=\"sfc-pill\">" + esc(t) + "</span>");
    });
    (Array.isArray(d && d.refineOptions) ? d.refineOptions : []).filter(x => x && x.label).forEach(x =>
      pills.push(pillHtml(x.label, Number(x.n).toLocaleString("en-US"), "", { cls: "sfc-chip", refine: x.refine, extra: " data-dim=\"" + esc(x.dimension || "") + "\" data-val=\"" + esc(x.value) + "\" data-mlabel=\"" + esc(x.label) + "\"" })));
    return pills.length ? "<p class=\"sfc-pills\">" + pills.join("") + "</p>" : "";
  }
  function optionsSrHtml(d, o) { return d && d.optionsState === "alike" && !o.interactive && optionLinesOf(d).length ? "<p class=\"sfc-sr\">" + optionLinesOf(d).map(esc).join(" ") + "</p>" : ""; }
  function sellsForCardHtml(answer, opts) {
    const d = answer || {};
    const o = opts || {};
    const hasRange = Array.isArray(d.cluster) && d.cluster.length === 2 && Number(d.cluster[0]) > 0 && Number(d.cluster[1]) > 0;
    const poolN = Number(d.poolN) || 0;
    // THE THIN CARD (Sam, Oct 19 2026, e63): with no range the card draws the engine's own words and sales and writes no
    // wording of its own: the engine's thinLine (one line by reason code, on every thin answer), else a refusal's own
    // samLine ("Sales too spread out for a range." only on the engine's spread refusal), then the engine's latestSaleLine,
    // then the engine's sale rows (d.cards, that exact car and year, in the engine's order). lowestSaleN / highestSaleN
    // are data only and never drawn (scripts/thinCardNoRange.mjs).
    const rows = Array.isArray(d.cards) ? d.cards.filter(c => c && Number(c.price) > 0) : [];
    // the engine's reason travels with its number (Oct 27 2026): a refusal says what the engine says (refusal_line), not a sentence of the card's own
    const line = (d.optionsState === "split" || d.optionsState === "apart" ? null : d.thinLine) || (d.tier === "refusal" ? (d.refusal_line || d.samLine) : null) || null;
    if (!hasRange && !line && !rows.length && !optionLinesOf(d).length) return ""; // truly nothing to show - never an empty shell

    // E98 (Sam, Oct 28 2026): the figures first (one block per option in a split or apart state, otherwise the one range), the pills in one row, then AT MOST TWO small grey lines, then the footer.
    // The window and the date live in the footer, so the basis line, "The typical range for cars like this." and "Latest sale" are not printed where the footer carries the window.
    const blocks = (d.optionsState === "split" || d.optionsState === "apart") ? blocksHtml(d, o) : "";
    const small = [];
    const addSmall = t => { if (t && typeof t === "string" && t.trim() && !small.includes(t.trim())) small.push(t.trim()); };
    addSmall(d.yearNote);
    addSmall(d.wideLine);
    if (!o.reasonsShown) addSmall(d.scope_reason);
    if (!o.reasonsShown && !o.scopeShown) addSmall(d.scopeLabel || d.rungLabel);
    addSmall(d.bodyLine);
    if (!o.reasonsShown && d.windowLonger === true && d.windowNote && d.windowNote !== d.basisLine) addSmall(d.windowNote);
    if (!o.reasonsShown) addSmall(d.mileageNote);
    if (!d.windowLine) { addSmall(d.basisLine); }
    addSmall(d.includesFromLine);
    addSmall(d.optionsNote);
    const smallHtml = small.slice(0, 2).map(t => "<p class=\"sfc-small\">" + esc(t) + "</p>").join("");
    let body = "";
    if (!blocks && (hasRange || line || rows.length)) body += "<h3 class=\"sfc-heading\">What these sell for</h3>";
    if (blocks) {
      body += blocks + smallHtml;
      if (o.partnerPillsHtml) body += o.partnerPillsHtml;
    } else if (hasRange) {
      body += "<p class=\"sfc-range\">" + esc(usd(d.cluster[0])) + " <span class=\"sfc-to\">to</span> " + esc(usd(d.cluster[1])) + "</p>";
      // The one placement rule: a partner pill sits directly under the range, never anywhere else.
      if (o.partnerPillsHtml) body += o.partnerPillsHtml;
      body += optionsSrHtml(d, o) + smallHtml;
    } else {
      if (line) body += "<p class=\"sfc-thin\">" + esc(line) + "</p>";
      if (o.partnerPillsHtml) body += o.partnerPillsHtml;
      body += optionsSrHtml(d, o) + smallHtml;
      if (d.latestSaleLine && !d.windowLine) body += "<p class=\"sfc-latest\">" + esc(d.latestSaleLine) + "</p>";
      if (rows.length && o.rows !== false) body += "<ul class=\"sfc-rows\">" + rows.map(c => saleRowHtml(c, o)).join("") + "</ul>";
    }
    body += asideFootnote(d);

    // THE FOOTER IS ONE LINE: "49 sales since October 2025. Updated Oct 28, 2026." ("Powered by GoAskSam." first only with the poweredBy option) The stale line ("Sales read on ... Updating now.") never prints to a visitor.
    const dot = t => /[.!?]$/.test(t) ? t : t + ".";
    // E98 (Sam, Oct 28 2026): on goasksam.com pages the footer reads "N sales since Month Year. Updated Oct 28, 2026." and the link How Sam decides, no "Powered by GoAskSam"; that line stays only on the
    // surfaces that sit away from our own pages (the partner demo, the Amazon demo), which pass the one kit option poweredBy.
    const footerBits = o.poweredBy ? ["Powered by GoAskSam."] : [];
    if (d.windowLine) footerBits.push(dot(d.windowLine));   // the engine's own words for the card's window ("12 sales, since December 2025.")
    // The date is the real last-ingest date the start pages print (lib/asOf.js lastUpdatedDate, Pacific), handed in by the page (o.updated, or window.GAS_UPDATED in the
    // browser); never the answer's read time. No date given: no date clause.
    const upd = (o && o.updated) || (typeof window !== "undefined" && window.GAS_UPDATED) || "";
    if (upd) footerBits.push("Updated " + upd + ".");
    const footer = "<div class=\"sfc-footer\"><span class=\"sfc-footer-left\">" + footerBits.map(esc).join(" ") +
      "</span>" + (o.marketHref ? "<span class=\"sfc-footer-links\"><a class=\"sfc-footer-link\" href=\"" + esc(o.marketHref) + "\" target=\"_blank\" rel=\"noopener\">" + marketLabel(d) + "</a><a class=\"sfc-footer-link\" href=\"/how-sam-decides\">How Sam decides</a></span>" : "<a class=\"sfc-footer-link\" href=\"/how-sam-decides\">How Sam decides</a>") + "</div>";

    return "<div class=\"sfc-card\"" + (o.marketHref ? " data-href=\"" + esc(o.marketHref) + "\"" : "") + ">" + body + footer + "</div>";
  }

  // Moved OFF the card on purpose. Full-width trend section only (the partner demo, per the brief).
  // Reads answer.trendQuarters (lib/onebox.js trendFor, mapped in mapEngineAnswer - Lane B's e58,
  // built for this card): the last four REAL calendar quarters (period "YYYY-Qn"), oldest first, so
  // the latest is always the LAST element - each with its own low/high/count/thin already computed
  // by the engine (thin = fewer than the range floor). Gated on BOTH: the latest quarter itself not
  // thin (its own count already cleared the floor) AND its midpoint sitting more than
  // QUARTER_MIDPOINT_DIFF_THRESHOLD away from the main range's own midpoint - otherwise the line is
  // just restating the headline.
  function latestQuarterRowHtml(answer) {
    const d = answer || {};
    if (!Array.isArray(d.cluster) || d.cluster.length !== 2) return "";
    const qs = Array.isArray(d.trendQuarters) ? d.trendQuarters : null;
    if (!qs || !qs.length) return "";
    const q = qs[qs.length - 1];
    if (!q || q.thin || !(Number(q.low) > 0) || !(Number(q.high) > 0)) return "";
    const mainMid = (Number(d.cluster[0]) + Number(d.cluster[1])) / 2;
    const qMid = (Number(q.low) + Number(q.high)) / 2;
    if (!(mainMid > 0)) return "";
    const diff = Math.abs(qMid - mainMid) / mainMid;
    if (!(diff > QUARTER_MIDPOINT_DIFF_THRESHOLD)) return "";
    const qLabel = String(q.period || "").replace("-Q", " Q"); // "2026-Q3" -> "2026 Q3"
    if (!/^\d{4} Q[1-4]$/.test(qLabel)) return "";
    const sentence = "Latest quarter: " + qLabel + ", " + usd(q.low) + " to " + usd(q.high) + " (" + countNoun(Number(q.count) || 0, "sale", { words: false }) + ")";
    return "<p class=\"sfc-quarter\">" + esc(sentence) + "</p>";
  }

  return { sellsForCardHtml, sellsForNarrowHtml, latestQuarterRowHtml, QUARTER_MIDPOINT_DIFF_THRESHOLD };
}

const _inst = sellsForCardFactory();
export const sellsForCardHtml = _inst.sellsForCardHtml;
export const sellsForNarrowHtml = _inst.sellsForNarrowHtml;
export const latestQuarterRowHtml = _inst.latestQuarterRowHtml;
export const QUARTER_MIDPOINT_DIFF_THRESHOLD = _inst.QUARTER_MIDPOINT_DIFF_THRESHOLD;

// Embeddable for Market Check's client-rendered result (public/js/onebox.js, a classic script with
// no module imports) - the EXACT same factory source, never a second hand-written copy. Include
// once, before js/onebox.js loads (see api/marketCheck.js).
export const SELLS_FOR_CARD_JS = "(function(){var f=(" + sellsForCardFactory.toString() + ")();window.sellsForCardHtml=f.sellsForCardHtml;window.sellsForNarrowHtml=f.sellsForNarrowHtml;window.latestQuarterRowHtml=f.latestQuarterRowHtml;})();";

export const SELLS_FOR_CARD_CSS = `
.sfc-card{background:var(--card,#FFFFFF);border:1px solid var(--div,#E2DED3);border-radius:16px;padding:22px 24px;margin:16px 0}
.sfc-heading{margin:0 0 14px;font:600 13px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--sec,#5E6B63)}
.sfc-bodyline{margin:0 0 10px;font:400 14px/1.4 var(--sans);color:var(--sec,#5E6B63)}
.sfc-range{margin:0 0 10px;font:600 clamp(28px,4vw,38px)/1.1 var(--serif,Georgia,serif);color:var(--num,var(--green,#1E4D38))}
.sfc-range .sfc-to{font:400 .5em/1 var(--sans);color:var(--sec,#5E6B63);vertical-align:middle}
.sfc-small{margin:0 0 4px;font:400 13px/1.4 var(--sans);color:var(--sec,#5E6B63)}
.sfc-aside{margin:4px 0 0;font:400 13px/1.4 var(--sans);color:var(--sec,#5E6B63)}
.sfc-thin{margin:0 0 4px;font:500 18px/1.4 var(--sans);color:var(--ink,#15201A)}
.sfc-blocks{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:18px 24px;margin:2px 0 12px}
.sfc-block{display:block;margin:0;padding:0;border:0;background:none;text-align:left;font:inherit;color:inherit;text-decoration:none}
.sfc-block>span,.sfc-vis>span{display:block}
.sfc-block .sfc-range{margin:4px 0 4px;font:600 clamp(24px,2.4vw,32px)/1.12 var(--serif,Georgia,serif);color:var(--num,var(--green,#1E4D38))}
.sfc-label,.sfc-narrow .sfc-label{margin:0;font:600 11px/1.2 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--sec,#5E6B63)}
.sfc-count{font:400 13px/1.4 var(--sans);color:var(--sec,#5E6B63)}
button.sfc-block{cursor:pointer;border-radius:8px}
button.sfc-block:hover .sfc-range,button.sfc-block:focus-visible .sfc-range{color:var(--ink,#15201A)}
button.sfc-block:focus-visible{outline:2px solid var(--green,#1E4D38);outline-offset:4px}
.narrow-strip{margin:0 0 14px}
.narrow-strip .sfc-label{margin:0 0 2px}
.narrow-strip .hero-miles{margin-top:10px}
.sfc-narrow{margin:6px 0 12px}
.sfc-pills{margin:8px 0 0;display:flex;gap:8px;flex-wrap:wrap}
.sfc-pill{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 14px;border-radius:999px;border:1.5px solid var(--green,#1E4D38);background:var(--card,#FFFFFF);color:var(--green,#1E4D38);font:600 14px/1 var(--sans);text-decoration:none;white-space:nowrap}
button.sfc-pill{cursor:pointer}
button.sfc-pill:hover,button.sfc-pill:focus-visible{background:var(--green,#1E4D38);color:var(--on-accent,#FFFFFF)}
.sfc-pn{font-weight:500;opacity:.8}
.sfc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.sfc-latest{margin:0 0 10px;font:400 14px/1.4 var(--sans);color:var(--sec,#5E6B63)}
.sfc-rows{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:8px}
.sfc-row{display:flex;align-items:center;gap:12px;min-width:0}
.sfc-row-img,.sfc-row-nophoto{flex:0 0 72px;width:72px;height:54px;border-radius:8px;object-fit:cover;background:var(--div,#E2DED3)}
.sfc-row-nophoto{display:flex;align-items:center;justify-content:center;font:400 11px/1.2 var(--sans);color:var(--sec,#5E6B63)}
.sfc-row-text{display:flex;flex-direction:column;min-width:0}
.sfc-row-title{font:500 14px/1.3 var(--sans);color:var(--ink,#15201A);overflow-wrap:anywhere}
.sfc-row-price{font:600 16px/1.3 var(--sans);color:var(--ink,#15201A)}
.sfc-row-meta{font:400 13px/1.3 var(--sans);color:var(--sec,#5E6B63)}
.sfc-footer{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:16px;padding-top:12px;border-top:1px solid var(--div,#E2DED3);font:400 12.5px/1.3 var(--sans);color:var(--sec,#5E6B63);flex-wrap:wrap}
.sfc-footer-left{min-width:0}
.sfc-footer-link{color:var(--green,#1E4D38);text-decoration:none;font-weight:600;white-space:nowrap}
.sfc-footer-link:hover{text-decoration:underline}
.sfc-footer-links{display:inline-flex;gap:16px;flex-wrap:wrap}
.sfc-short{display:none}
@media (max-width:520px){.sfc-long{display:none}.sfc-short{display:inline}}
.sfc-card[data-href]{cursor:pointer}
.sfc-quarter{margin:0;font:400 15px/1.5 var(--sans);color:var(--ink,#15201A)}
`;
