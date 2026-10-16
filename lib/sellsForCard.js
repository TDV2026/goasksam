// THE SHARED "What these sell for" CARD (Sam, Oct 2026, one engine / one card job). Every product
// (Market Check, Buy, Sell, Tasks, the partner demo) renders this card from the SAME function, so the
// same car reads the same card everywhere. "Better nothing than a fake number" - every number on the
// card comes straight off the engine's own answer object (answer.cluster/poolN/windowMonths/
// setAsideCount/setAsideReasons/stale/staleLine/readAt), nothing computed, guessed or hand-written here.
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
//                                    directly under the range itself (the one placement rule -
//                                    never insert pills anywhere else around the card).
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

  // "{k} set aside: {reasons}." - the engine's own setAsideReasons object (reason -> count), same
  // bucketing lib/onebox.js setAsideReasonFor already produces for every other set-aside surface.
  // Never gated on whether a range exists - a thin answer can still have set-aside rows behind it.
  function asideFootnote(answer) {
    const k = Number(answer && answer.setAsideCount) || 0;
    const reasons = answer && answer.setAsideReasons;
    if (!k || !reasons || typeof reasons !== "object") return "";
    const bits = [];
    Object.keys(reasons).forEach(key => {
      const n = Number(reasons[key]) || 0;
      if (n > 0) bits.push(n + " " + key);
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
    if (!hasRange && !poolN) return ""; // truly nothing to show - never an empty shell

    let body = "";
    if (hasRange) {
      body += "<p class=\"sfc-range\">" + esc(usd(d.cluster[0])) + " <span class=\"sfc-to\">to</span> " + esc(usd(d.cluster[1])) + "</p>";
      // The one placement rule: a partner pill sits directly under the range, never anywhere else.
      if (o.partnerPillsHtml) body += o.partnerPillsHtml;
      const windowMonths = Number(d.windowMonths);
      if (poolN > 0 && windowMonths > 0) {
        body += "<p class=\"sfc-basis\">" + esc("Middle half of " + poolN + " sales, last " + windowMonths + " months.") + "</p>";
      }
    } else {
      // Under eight sales, or the engine found no honest cluster at all (sales too spread out) -
      // either way: thin text, never a range. The actual sale rows stay in the page's existing
      // sales section below the card (this card never lists individual sales - "nothing else").
      const thin = poolN < 8
        ? (poolN + (poolN === 1 ? " sale found, not enough for a range." : " sales found, not enough for a range."))
        : "Sales too spread out for a range.";
      body += "<p class=\"sfc-thin\">" + esc(thin) + "</p>";
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

  // The quarter label is a real calendar quarter computed from the period's own end date (the
  // engine's trailing-window periods are NOT calendar-aligned - lib/onebox.js tradingPeriodsFor's own
  // comment: "never calendar quarters" - so this reads as "the quarter the latest trailing window
  // ends in", not a claim that the underlying bucket is Jan-Mar/Apr-Jun/etc. The $ band and sale
  // count are the real trailing-window numbers either way; only the label is a calendar reading of a
  // real date).
  function quarterLabelFromDate(iso) {
    if (!iso) return null;
    const d = new Date(iso + "T00:00:00Z");
    if (isNaN(d.getTime())) return null;
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return d.getUTCFullYear() + " Q" + q;
  }

  // Moved OFF the card on purpose. Full-width trend section only (the partner demo, per the brief).
  // Gated on BOTH: the latest trailing period itself clearing the range floor (already true of any
  // period the engine returns at all - lib/onebox.js tradingPeriodsFor only pushes a period at
  // RANGE_THRESHOLD=8 or more) AND its midpoint sitting more than QUARTER_MIDPOINT_DIFF_THRESHOLD
  // away from the main range's own midpoint - otherwise the line is just restating the headline.
  function latestQuarterRowHtml(answer) {
    const d = answer || {};
    if (!Array.isArray(d.cluster) || d.cluster.length !== 2) return "";
    const qb = Array.isArray(d.quarterlyBands) && d.quarterlyBands.length ? d.quarterlyBands[0] : null;
    if (!qb || !Array.isArray(qb.band) || qb.band.length !== 2) return "";
    const salesN = Array.isArray(qb.sales) ? qb.sales.length : 0;
    if (salesN < 8) return "";
    const mainMid = (Number(d.cluster[0]) + Number(d.cluster[1])) / 2;
    const qMid = (Number(qb.band[0]) + Number(qb.band[1])) / 2;
    if (!(mainMid > 0)) return "";
    const diff = Math.abs(qMid - mainMid) / mainMid;
    if (!(diff > QUARTER_MIDPOINT_DIFF_THRESHOLD)) return "";
    const endIso = String(qb.period || "").split(" to ").pop();
    const qLabel = quarterLabelFromDate(endIso);
    if (!qLabel) return "";
    const sentence = "Latest quarter: " + qLabel + ", " + usd(qb.band[0]) + " to " + usd(qb.band[1]) + " (" + salesN + " sales)";
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
.sfc-range{margin:0 0 10px;font:600 clamp(28px,4vw,38px)/1.1 var(--serif,Georgia,serif);color:var(--num,var(--green,#1E4D38))}
.sfc-range .sfc-to{font:400 .5em/1 var(--sans);color:var(--sec,#5E6B63);vertical-align:middle}
.sfc-basis{margin:0 0 4px;font:400 14px/1.4 var(--sans);color:var(--sec,#5E6B63)}
.sfc-aside{margin:4px 0 0;font:400 13px/1.4 var(--sans);color:var(--sec,#5E6B63)}
.sfc-thin{margin:0 0 4px;font:500 18px/1.4 var(--sans);color:var(--ink,#15201A)}
.sfc-footer{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:16px;padding-top:12px;border-top:1px solid var(--div,#E2DED3);font:400 12.5px/1.3 var(--sans);color:var(--sec,#5E6B63);flex-wrap:wrap}
.sfc-footer-left{min-width:0}
.sfc-footer-link{color:var(--green,#1E4D38);text-decoration:none;font-weight:600;white-space:nowrap}
.sfc-footer-link:hover{text-decoration:underline}
.sfc-quarter{margin:0;font:400 15px/1.5 var(--sans);color:var(--ink,#15201A)}
`;
