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
    const mi = Number(c.mi) > 0 ? Math.round(Number(c.mi)).toLocaleString("en-US") + " miles at sale" : "";
    const when = monthYear(c.date);
    const title = o.rowTitles === false ? "" : String(c.title || "").trim();
    return "<li class=\"sfc-row\">" + photo + "<span class=\"sfc-row-text\">" +
      (title ? "<span class=\"sfc-row-title\">" + esc(title) + "</span>" : "") +
      "<span class=\"sfc-row-price\">" + esc(usd(c.price)) + "</span>" +
      "<span class=\"sfc-row-meta\">" + esc([when, mi].filter(Boolean).join(", ")) + "</span></span></li>";
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
  // THE POOLED STATES (e95): the engine's pooledApart / pooledSplit options, each { label, n, low, high }, one plain line each under the headline (split) or in
  // place of it (apart, where the engine's own thinLine stands in for the range). Printed as they come; nothing computed. Alike: neither field, no line.
  function pooledNoteOf(d, o) {
    // the engine's own words for an option that reads a longer window than the bare page ("Based on 13 sales over the last 24 months."): on the option itself, else on the same option in the answer's own option lists
    if (o.windowLonger === true && o.windowNote) return String(o.windowNote);
    var lists = [];
    if (o.dimension === "body") lists.push(d.bodyOptions);
    if (o.dimension === "edition") (Array.isArray(d.variantOptionsLine) ? d.variantOptionsLine : []).forEach(function (e) { if (e && e.key !== "restoration") lists.push(e.options); });
    if (o.dimension === "gearbox") (Array.isArray(d.inlineSplits) ? d.inlineSplits : []).forEach(function (e) { if (e && e.key === "gearbox" && Array.isArray(e.sides)) lists.push(e.sides.map(function (s) { return { value: /manual/i.test(String(s.label || "")) ? "manual" : "auto", windowLonger: s.windowLonger, windowNote: s.windowNote }; })); });
    for (var i = 0; i < lists.length; i++) for (var j = 0; Array.isArray(lists[i]) && j < lists[i].length; j++) { var e = lists[i][j]; if (e && String(e.value) === String(o.value) && e.windowLonger === true && e.windowNote) return String(e.windowNote); }
    return "";
  }
  function pooledLinesHtml(d) {
    const src = d && (d.pooledApart || d.pooledSplit);
    const opts = src && Array.isArray(src.options) ? src.options.filter(o => o && Number(o.n) > 0 && Number(o.low) > 0 && Number(o.high) > 0) : [];
    if (opts.length < 2) return "";
    return "<ul class=\"sfc-pool\">" + opts.map(o => "<li>" + esc(o.label) + ": " + esc(usd(o.low)) + " to " + esc(usd(o.high)) + (pooledNoteOf(d, o) ? ". " + esc(pooledNoteOf(d, o)) : ", " + esc(countNoun(o.n, "sale", { words: false })) + ".") + "</li>").join("") + "</ul>";
  }
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
    const line = (d.pooledApart || d.thinReason === "pooled_apart" ? "These sell in different price ranges, so one range would mislead." : d.thinLine) || (d.tier === "refusal" ? (d.refusal_line || d.samLine) : null) || null;
    if (!hasRange && !line && !rows.length) return ""; // truly nothing to show - never an empty shell

    let body = "";
    // "No listing states a body" (Sam, Oct 16 2026, e58): the engine's own bodyLine, verbatim, never
    // reconstructed here - a typed body word with no row stating any body is accepted as a label and
    // the whole pool is read; this line says so, in the same spot on every product, whether the
    // whole pool lands a range or stays thin. answer.bodyLabel exists alongside it but is not
    // printed separately - the engine's own sentence already names the body word in full.
    if (d.bodyLine) body += "<p class=\"sfc-bodyline\">" + esc(d.bodyLine) + "</p>";
    // THE REASONS (Sam, Oct 27 2026): what the number covers and why it reads as it does, the engine's own words, printed as they come. A page that already prints them (Market Check
    // passes reasonsShown, a page with its own scope line passes scopeShown) is not told twice.
    if (!o.reasonsShown && d.scope_reason) body += "<p class=\"sfc-why\">" + esc(d.scope_reason) + "</p>";
    if (!o.reasonsShown && !o.scopeShown && (d.scopeLabel || d.rungLabel)) body += "<p class=\"sfc-scope\">" + esc(d.scopeLabel || d.rungLabel) + "</p>";
    if (hasRange) {
      body += "<p class=\"sfc-range\">" + esc(usd(d.cluster[0])) + " <span class=\"sfc-to\">to</span> " + esc(usd(d.cluster[1])) + "</p>";
      // What the range is (Sam, Oct 18 2026): the engine's cluster is the middle half of the included sales, so half of
      // them sold inside it. Only where a range prints; under eight sales nothing changes.
      // Sam, Oct 21 2026 (Market Check item 1): "Half of these sold in this range." became this line, every product the shared card
      // reaches; the exact meaning stays in How Sam decides and the partner card's small line.
      body += "<p class=\"sfc-half\">The typical range for cars like this.</p>";
      // The one placement rule: a partner pill sits directly under the range and its one line, never anywhere else.
      if (o.partnerPillsHtml) body += o.partnerPillsHtml;
      // BASIS LINE, NO MONTH COUNT (Sam, approved 2026-10-18): the engine's own pre-built sentence, verbatim, never
      // reconstructed here - "Based on {N} sales, the latest in {Month Year}." (N in words under ten), replacing the old
      // "Middle half of N sales, last M months." this card used to build itself. includesFromLine follows it, only when
      // the oldest included sale is over three years old ("Includes sales from {Year}."), same decision, same source.
      if (d.basisLine) body += "<p class=\"sfc-basis\">" + esc(d.basisLine) + "</p>";
      if (d.includesFromLine) body += "<p class=\"sfc-basis\">" + esc(d.includesFromLine) + "</p>";
      body += pooledLinesHtml(d);
      if (!o.reasonsShown && d.windowLonger === true && d.windowNote && d.windowNote !== d.basisLine) body += "<p class=\"sfc-basis\">" + esc(d.windowNote) + "</p>";
      if (!o.reasonsShown && d.mileageNote) body += "<p class=\"sfc-basis\">" + esc(d.mileageNote) + "</p>";
    } else {
      if (line) body += "<p class=\"sfc-thin\">" + esc(line) + "</p>";
      body += pooledLinesHtml(d);
      // The same one placement rule as the range case (Sam, Oct 2026, partner demo job): a pill sits directly under the
      // headline, here the engine's line, never anywhere else.
      if (o.partnerPillsHtml) body += o.partnerPillsHtml;
      if (d.latestSaleLine) body += "<p class=\"sfc-latest\">" + esc(d.latestSaleLine) + "</p>";
      if (rows.length && o.rows !== false) body += "<ul class=\"sfc-rows\">" + rows.map(c => saleRowHtml(c, o)).join("") + "</ul>";
    }
    body += asideFootnote(d);

    const footerBits = ["Powered by GoAskSam"];
    if (d.stale && d.staleLine) {
      footerBits.push(d.staleLine);
    } else {
      // The date is the real last-ingest date the start pages print (lib/asOf.js lastUpdatedDate, Pacific), handed in by the page (o.updated, or window.GAS_UPDATED in the
      // browser); never the answer's read time, which is the clock (and was read in UTC: 20:33 Pacific on the 26th printed the 27th). No date given: no date clause.
      const upd = (o && o.updated) || (typeof window !== "undefined" && window.GAS_UPDATED) || "";
      if (upd) footerBits.push("Updated " + upd);
    }
    const footer = "<div class=\"sfc-footer\"><span class=\"sfc-footer-left\">" + footerBits.map(esc).join(" &middot; ") +
      "</span>" + (o.marketHref ? "<span class=\"sfc-footer-links\"><a class=\"sfc-footer-link\" href=\"" + esc(o.marketHref) + "\" target=\"_blank\" rel=\"noopener\">" + marketLabel(d) + "</a><a class=\"sfc-footer-link\" href=\"/how-sam-decides\">How Sam decides</a></span>" : "<a class=\"sfc-footer-link\" href=\"/how-sam-decides\">How Sam decides</a>") + "</div>";

    return "<div class=\"sfc-card\"" + (o.marketHref ? " data-href=\"" + esc(o.marketHref) + "\"" : "") + "><h3 class=\"sfc-heading\">What these sell for</h3>" + body + footer + "</div>";
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

  return { sellsForCardHtml, latestQuarterRowHtml, QUARTER_MIDPOINT_DIFF_THRESHOLD };
}

const _inst = sellsForCardFactory();
export const sellsForCardHtml = _inst.sellsForCardHtml;
export const latestQuarterRowHtml = _inst.latestQuarterRowHtml;
export const QUARTER_MIDPOINT_DIFF_THRESHOLD = _inst.QUARTER_MIDPOINT_DIFF_THRESHOLD;

// Embeddable for Market Check's client-rendered result (public/js/onebox.js, a classic script with
// no module imports) - the EXACT same factory source, never a second hand-written copy. Include
// once, before js/onebox.js loads (see api/marketCheck.js).
export const SELLS_FOR_CARD_JS = "(function(){var f=(" + sellsForCardFactory.toString() + ")();window.sellsForCardHtml=f.sellsForCardHtml;window.latestQuarterRowHtml=f.latestQuarterRowHtml;})();";

export const SELLS_FOR_CARD_CSS = `
.sfc-card{background:var(--card,#FFFFFF);border:1px solid var(--div,#E2DED3);border-radius:16px;padding:22px 24px;margin:16px 0}
.sfc-heading{margin:0 0 14px;font:600 13px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--sec,#5E6B63)}
.sfc-bodyline{margin:0 0 10px;font:400 14px/1.4 var(--sans);color:var(--sec,#5E6B63)}
.sfc-range{margin:0 0 10px;font:600 clamp(28px,4vw,38px)/1.1 var(--serif,Georgia,serif);color:var(--num,var(--green,#1E4D38))}
.sfc-range .sfc-to{font:400 .5em/1 var(--sans);color:var(--sec,#5E6B63);vertical-align:middle}
.sfc-half{margin:-4px 0 10px;font:400 15px/1.4 var(--sans);color:var(--ink,#1A1A1A)}
.sfc-basis{margin:0 0 4px;font:400 14px/1.4 var(--sans);color:var(--sec,#5E6B63)}
.sfc-aside{margin:4px 0 0;font:400 13px/1.4 var(--sans);color:var(--sec,#5E6B63)}
.sfc-thin{margin:0 0 4px;font:500 18px/1.4 var(--sans);color:var(--ink,#15201A)}
.sfc-why,.sfc-scope{margin:0 0 4px;font:400 15px/1.5 var(--sans);color:var(--sec,#5E6B63)}
.sfc-pool{list-style:none;margin:6px 0 8px;padding:0;display:grid;gap:4px;font:400 15px/1.5 var(--sans);color:var(--ink,#15201A)}
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
