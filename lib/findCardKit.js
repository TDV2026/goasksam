// THE FIND CARD, AS A KIT (Sam, Oct 23 2026: "the same card as Find, from the same component and the same engine fields"). Tasks (its
// page now, its emails next) show a live car with EXACTLY Find's card: the photo with its dark source and time label and the LAST BID SEEN
// strip, the title, miles and place, the tags, the SAM range panel, View auction and Market Check, and Sold before / Listed before. There is
// ONE implementation of that card: the one inside api/buy.js's client. This module does not copy it: at load it READS the client's own
// source and lifts the named declarations below (in their original order) into a self-contained script, so a change to Find's card is a
// change to Tasks' card. scripts/findCardKitCheck.mjs renders the same engine card on Find's real page and on the Tasks page and requires
// byte-identical markup, so the two can never drift apart quietly.
//
// What the kit leaves out on purpose: the "Before it ends" switch and the car watch inside the Market Check drawer (a Task IS that watch,
// and those buttons act on Find's own state), so the Tasks drawer ends at "Open full Market Check".
import { BUY_CLIENT_SOURCE, BUY_CSS, CARD_RULES_CSS, RUNG_CSS, BUY_CARD_CSS, PRIOR_JS } from "../api/buy.js";
import { SELLS_FOR_CARD_CSS } from "./sellsForCard.js";

export const KIT_NAMES = ["esc", "usd", "num", "cnt", "M", "monthYear", "TZ", "timePT", "sameDay", "bidText", "bidAt", "bidAge", "BIDFMT", "SYM", "localMoney", "HOUSE", "CPHRASE", "cap",
  "notUS", "cityOf", "okUrl", "saleLink", "timeLeft", "carTitle", "armedLive", "pillText", "photoHtml", "awayWords", "moneyHtml", "metaLine", "stampBids", "MON3", "monShort", "sameCar",
  "rungHtml", "BODY_WORDS", "carWords", "rungShown", "fxOpt", "fxHead", "fxTail", "rangeFirst", "noRange", "compactNoRange", "saleLineText", "thinSales", "samLine", "histChipHtml", "chipsHtml", "slInner", "card", "mcState", "closeOverlays",
  "mdHeadHtml", "sameName", "mdRowHtml", "drawerHtml", "openDrawer", "PANEL", "panelRun", "cardLine", "histHtml", "saleModalHtml", "closeSale", "openSale", "openCardSale", "showSale", "openHist", "ALIGN", "alignRows"];

function declarations(src) {
  const L = src.split("\n"), decl = [];
  L.forEach((l, i) => { const m = /^  (?:function (\w+)\(|var (\w+)\b)/.exec(l); if (m) decl.push({ name: m[1] || m[2], line: i }); });
  decl.forEach((d, k) => { d.end = (decl[k + 1] ? decl[k + 1].line : L.length) - 1; while (d.end > d.line && /^\s*(\/\/|$)/.test(L[d.end])) d.end--; d.text = L.slice(d.line, d.end + 1).join("\n"); });
  return decl;
}
// One-line declarations that hold several names ("var a = .., b = ..") are found by their FIRST name; the kit asks for names, so list them by that name.
export function buildKitSource(clientSrc = BUY_CLIENT_SOURCE) {
  const by = new Map(); for (const d of declarations(clientSrc)) if (!by.has(d.name)) by.set(d.name, d);
  const missing = KIT_NAMES.filter(n => !by.has(n));
  if (missing.length) throw new Error("findCardKit: Find's client no longer declares " + missing.join(", ") + " (update KIT_NAMES)");
  const code = KIT_NAMES.map(n => by.get(n)).sort((a, b) => a.line - b.line).map(d => d.text).join("\n");
  return { code, names: KIT_NAMES.slice() };
}

// The script. Its contract with the page: window.GAS_REL ({ mc, tasks }) as on Find; it exposes window.GASCARD.
//   card(l)       the card's markup for an engine card l (the same fields Find's /api/buySearch cards carry)
//   register(l)   remembers l so the card's drawer and history popup can read it (Find's CARDS map)
//   bind(root)    makes the card's buttons work (Market Check drawer, history popup, Show more), one delegated listener
export function findCardKitJs() {
  const { code } = buildKitSource();
  return `(function(){
  var REL = window.GAS_REL || {}, REL_MC = REL.mc === true, REL_TASKS = REL.tasks === true;
  var ALERTS = {}, CARDS = {};
  var alertSwitchHtml = function(){ return ""; }, watchHtml = function(){ return ""; };
  ${PRIOR_JS}
${code}
  window.GASCARD = {
    card: function(l){ CARDS[l.id] = l; return card(l); },
    register: function(l){ CARDS[l.id] = l; },
    stamp: stampBids,
    // the card's own string builders, for the task email (lib/tasks/emailCards.js reads the SAME pieces and puts them in a table layout)
    parts: { carTitle: carTitle, pillText: pillText, moneyHtml: moneyHtml, metaLine: metaLine, chipsHtml: chipsHtml, slInner: slInner, histChipHtml: histChipHtml },
    bind: function(){
      if (window.__gasCardBound) return; window.__gasCardBound = true;
      document.addEventListener("click", function(e){
        var sb = e.target.closest && e.target.closest("[data-sale]"); if (sb) { e.preventDefault(); return openSale(sb); }
        var fb = e.target.closest && e.target.closest("[data-fxsale]"); if (fb) { e.preventDefault(); return openCardSale(fb); }
        if (e.target.closest && e.target.closest("[data-salex]")) { e.preventDefault(); return closeSale(); }
        var hb = e.target.closest && e.target.closest("[data-hist]"); if (hb) { e.preventDefault(); return openHist(hb); }
        if (e.target.closest && e.target.closest("[data-hpclose]")) { e.preventDefault(); return closeOverlays(); }
        var mm = e.target.closest && e.target.closest("[data-mdmore]"); if (mm) { e.preventDefault(); var ul = mm.closest(".mcdrawer").querySelector(".md-rows"); if (ul) Array.prototype.forEach.call(ul.querySelectorAll(".md-row[hidden]"), function(r){ r.hidden = false; }); mm.parentNode.remove(); return; }
        if (document.querySelector(".hpop") && !e.target.closest(".hpop")) closeOverlays(document.querySelector(".mcdrawer"));
        var t = e.target.closest && e.target.closest("[data-mc],[data-mcclose]"); if (!t) return;
        if (t.tagName === "A") e.preventDefault();
        if (t.hasAttribute("data-mcclose")) { e.preventDefault(); var dr = t.closest(".mcdrawer"); if (dr) { var id = dr.getAttribute("data-for"); closeOverlays(); } return; }
        if (t.hasAttribute("data-mc")) { e.preventDefault(); return openDrawer(t); }
      });
      setInterval(stampBids, 30000); stampBids();
      // The rigid grid (Find's own row aligner, lifted with the card): cards in a row keep the same title, tag and range regions.
      var q = 0, soon = function(){ if (!q) q = requestAnimationFrame(function(){ q = 0; alignRows(); }); };
      try { new MutationObserver(soon).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
      window.addEventListener("resize", soon); soon();
    }
  };
})();`;
}
// The card's styles are Find's own: the card rules, the rung line, the card sheet, the range panel, and the part of Find's page sheet that
// styles .car, the grid and the drawer (Find's page layout rules are left out so they never touch the host page).
const PAGE_RULE = /^\s*(?:\.buymain|\.scroll|\.col\b|\.composer|\.search\b|\.msg\b|\.mvlist|\.vlist|\.mvis|#gas-rail|\.srch|\.srow|\.newbtn|#convo|\.opening|\.dots\b)/;
export const FIND_CARD_CSS = [CARD_RULES_CSS, RUNG_CSS, BUY_CARD_CSS, SELLS_FOR_CARD_CSS, BUY_CSS.split("\n").filter(r => !PAGE_RULE.test(r)).join("\n")].join("\n");
