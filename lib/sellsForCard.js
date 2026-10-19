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
    Object.keys(reasons).forEach(key => {
      const n = Number(reasons[key]) || 0;
      if (n > 0) { bits.push(n + " " + key); k += n; }
    });
    if (!bits.length) return "";
    const sentence = k + (k === 1 ? " set aside: " : " set aside: ") + bits.join(", ") + ".";
    return "<p class=\"sfc-aside\">" + esc(sentence) + "</p>";
  }

  // THE CARD. Exactly the five pieces in the brief, in order, nothing else.
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
    const line = d.thinLine || (d.tier === "refusal" ? d.samLine : null) || null;
    if (!hasRange && !line && !rows.length) return ""; // truly nothing to show - never an empty shell

    let body = "";
    // "No listing states a body" (Sam, Oct 16 2026, e58): the engine's own bodyLine, verbatim, never
    // reconstructed here - a typed body word with no row stating any body is accepted as a label and
    // the whole pool is read; this line says so, in the same spot on every product, whether the
    // whole pool lands a range or stays thin. answer.bodyLabel exists alongside it but is not
    // printed separately - the engine's own sentence already names the body word in full.
    if (d.bodyLine) body += "<p class=\"sfc-bodyline\">" + esc(d.bodyLine) + "</p>";
    if (hasRange) {
      body += "<p class=\"sfc-range\">" + esc(usd(d.cluster[0])) + " <span class=\"sfc-to\">to</span> " + esc(usd(d.cluster[1])) + "</p>";
      // What the range is (Sam, Oct 18 2026): the engine's cluster is the middle half of the included sales, so half of
      // them sold inside it. Only where a range prints; under eight sales nothing changes.
      body += "<p class=\"sfc-half\">Half of these sold in this range.</p>";
      // The one placement rule: a partner pill sits directly under the range and its one line, never anywhere else.
      if (o.partnerPillsHtml) body += o.partnerPillsHtml;
      // BASIS LINE, NO MONTH COUNT (Sam, approved 2026-10-18): the engine's own pre-built sentence, verbatim, never
      // reconstructed here - "Based on {N} sales, the latest in {Month Year}." (N in words under ten), replacing the old
      // "Middle half of N sales, last M months." this card used to build itself. includesFromLine follows it, only when
      // the oldest included sale is over three years old ("Includes sales from {Year}."), same decision, same source.
      if (d.basisLine) body += "<p class=\"sfc-basis\">" + esc(d.basisLine) + "</p>";
      if (d.includesFromLine) body += "<p class=\"sfc-basis\">" + esc(d.includesFromLine) + "</p>";
    } else {
      if (line) body += "<p class=\"sfc-thin\">" + esc(line) + "</p>";
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
      const label = monD(d.readAt);
      if (label) footerBits.push("Updated " + label); // readAt missing: date clause left out entirely, never invented
    }
    const footer = "<div class=\"sfc-footer\"><span class=\"sfc-footer-left\">" + footerBits.map(esc).join(" &middot; ") +
      "</span><a class=\"sfc-footer-link\" href=\"/how-sam-decides\">How Sam decides</a></div>";

    return "<div class=\"sfc-card\"><h3 class=\"sfc-heading\">What these sell for</h3>" + body + footer + "</div>";
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
    const sentence = "Latest quarter: " + qLabel + ", " + usd(q.low) + " to " + usd(q.high) + " (" + (Number(q.count) || 0) + " sales)";
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
.sfc-quarter{margin:0;font:400 15px/1.5 var(--sans);color:var(--ink,#15201A)}
`;
