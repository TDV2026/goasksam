// THE FIND CARD'S THREE SLOTS, FROM THE ENGINE (Lane E, Nov 3 2026, lane-e-cardsize; Sam: "every card is the same size and shape"). One Sam box for every state, three slots in this order: a small LABEL line above, the HEADLINE, a small LINE below.
// The page prints cardLabel, cardHeadline and cardLine and nothing else; this module chooses them from the engine's own fields (the market's findAnswer, options, counts, windows, lines), in every state:
//   range answer ........ label "19 sales since Sep 2026", headline the figures, line the bid line;
//   apart by mileage .... label the band nearest the car's mileage that has a range, with its count and since date ("50,000 to 100,000 miles, 9 sales since Nov 2025"), headline that band's figures, line the car's thin band
//                         in short form with the pointer ("Under 50,000 miles: 4 sales, too few. See the sales for each band."). This is the nearBand field (lane-b-mileageband) as a LABELLED line, never an unlabelled headline.
//                         Words in the headline only when no band has a range;
//   apart by another dimension, no matched option: headline "Priced apart", label the count, line the pointer;
//   thin, no sales, not tracked, refused, unmatched: words in the headline (short, so one line at 390 wide), the engine's own line below.
// cardBand names the band or option the headline shows ({ dimension, value }), so See the sales opens the popup on it. Months are abbreviated in every label.
import { countNoun } from "../countNoun.js";
import { reasonLine, reasonPatterns } from "../reasonWords.js";
import { MILE_BANDS } from "../onebox.js";

const MONTHS = { January: "Jan", February: "Feb", March: "Mar", April: "Apr", June: "Jun", July: "Jul", August: "Aug", September: "Sep", October: "Oct", November: "Nov", December: "Dec" };
export const abbrevMonths = t => String(t == null ? "" : t).replace(/\b(January|February|March|April|June|July|August|September|October|November|December)\b/g, m => MONTHS[m]).replace(/\.$/, "");
const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
const NOUN = { gearbox: "gearbox", body: "body", edition: "edition", year: "year", mileage: "band", variant: "variant", trim: "trim" };
const sales = n => countNoun(Number(n) || 0, "sale", { words: false });
// NO CARD TEXT IS EVER TRUNCATED (Sam, Nov 3 2026): the page applies no ellipsis and no line clamp to a Sam box slot, so every slot is written to fit. The limits are in characters, sized for a phone 390 wide (the label and headline one line,
// the line below two) and measured in Chrome (scripts/slotLimitCheck.mjs). An engine line over its limit is replaced by its card form (card.short_*), else cut at its first sentence; a label drops its window clause; a headline of figures
// too wide for its line is written short ($1.2M). scripts/slotLimitCheck.mjs fails any line, from any source that can land in a slot, over its limit.
export const LIMITS = { label: 48, headline: 20, line: 84 };
const SHORT = { "find.split_unsaid": "card.short_split_unsaid", "refusal.no_sales": "card.short_no_sales", "refusal.no_body": "card.short_no_body", "refusal.not_tracked": "card.short_not_tracked" };
let PATTERNS = null;
const idOf = t => { PATTERNS = PATTERNS || reasonPatterns(); const hits = PATTERNS.filter(p => !/^card\./.test(p.id) && p.re.test(t)).sort((x, y) => y.re.source.length - x.re.source.length); return hits.length ? hits[0].id : null; };   // the most specific entry that reads this line
export function fitLine(text) {
  const t = String(text == null ? "" : text).trim(); if (t.length <= LIMITS.line) return t;
  const id = idOf(t); if (id && SHORT[id]) return reasonLine(SHORT[id]);
  const first = (t.match(/^.*?\.(?=\s|$)/) || [""])[0]; return first && first.length <= LIMITS.line ? first : "";
}
const fitLabel = (what, count, window) => { const full = reasonLine("card.label", { what, count, window }); if (full.length <= LIMITS.label) return full; const bare = reasonLine("card.label", { what, count, window: "" }); return bare.length <= LIMITS.label ? bare : reasonLine("card.label", { what: "", count, window: "" }); };
const shortMoney = n => n >= 1e6 ? "$" + String(Math.round(n / 1e4) / 100).replace(/\.?0+$/, "") + "M" : "$" + Math.round(n / 1000) + "k";
const figures = (lo, hi) => { const full = usd(lo) + " to " + usd(hi); return full.length <= LIMITS.headline ? full : shortMoney(lo) + " to " + shortMoney(hi); };
const EMPTY = { cardLabel: "", cardHeadline: "", cardLine: "", cardBand: null };

export function cardSlotsOf(c) {
  const m = c && !c.swap ? c.market : null;
  if (!m || m.kind === "pending") return { ...EMPTY };
  const win = abbrevMonths(m.window || ""), fa = m.findAnswer && typeof m.findAnswer === "object" ? m.findAnswer : null;
  const bid = (() => { if (fa && Array.isArray(fa.lines)) return fa.lines.slice(1).filter(t => typeof t === "string" && t && t !== fa.pointer).join(" "); const e = (c.sam_lines || []).find(x => x && x.kind === "range"); return e && e.bidLine ? String(e.bidLine) : ""; })();
  if (m.kind === "not_tracked") return { ...EMPTY, cardHeadline: reasonLine("card.not_tracked_headline"), cardLine: fitLine(m.notTrackedLine) };
  if (m.kind === "refused") return { ...EMPTY, cardHeadline: reasonLine("card.refused_headline"), cardLine: fitLine(m.refusalLine) };
  if (m.kind === "unmatched") return { ...EMPTY, cardHeadline: reasonLine("card.unmatched_headline"), cardLine: reasonLine("card.unmatched_line") };
  const opts = Array.isArray(m.options) ? m.options : [], apart = (m.optionsState === "apart" || m.optionsState === "split") && opts.length > 1;
  const n = Number(m.count) || (fa && Number(fa.n)) || 0;
  // a range answer (the pool's, or the option or band the listing matches): the figures are the headline
  if (fa && fa.state === "range" && fa.range && fa.range.low > 0 && fa.range.high > 0) {
    const o = fa.option && fa.option.value != null ? opts.find(x => x && x.dimension === fa.option.dimension && String(x.value) === String(fa.option.value)) : null;
    const label = fitLabel(fa.option ? fa.option.label : "", sales(fa.n || n), abbrevMonths((o && o.windowWords) || m.window || ""));
    return { cardLabel: label, cardHeadline: figures(fa.range.low, fa.range.high), cardLine: fitLine(bid), cardBand: fa.option ? { dimension: fa.option.dimension, value: fa.option.value } : null };
  }
  if (!fa && m.kind === "range" && m.low > 0 && m.high > 0) return { cardLabel: fitLabel("", sales(n), win), cardHeadline: figures(m.low, m.high), cardLine: fitLine(bid), cardBand: null };
  // an answer that prices apart, or a band too thin for a range, beside other bands
  if (apart) {
    const dim = m.headlineDimension || (opts[0] && opts[0].dimension) || (fa && fa.option && fa.option.dimension) || "", ranged = opts.filter(o => o && o.rangeFloor !== true && o.low > 0 && o.high > 0);
    if (dim === "mileage" && ranged.length) {
      const miles = Number((m.miles && m.miles.miles) || c.miles || c.kmMiles) || 0, bandOf = o => MILE_BANDS.find(b => b.value === o.value) || null;
      const dist = o => { const b = bandOf(o); if (!b || !(miles > 0)) return 0; return miles < b.miMin ? b.miMin - miles : (b.miMax != null && miles >= b.miMax ? miles - b.miMax : 0); };
      const best = ranged.slice().sort((x, y) => (miles > 0 ? dist(x) - dist(y) : (Number(y.n) || 0) - (Number(x.n) || 0)))[0];
      const ownB = miles > 0 ? MILE_BANDS.find(b => miles >= b.miMin && (b.miMax == null || miles < b.miMax)) : null, ownO = ownB ? opts.find(x => x && x.value === ownB.value) : null;
      const thin = ownO && ownO.rangeFloor === true && Number(ownO.n) > 0 ? ownO : fa && fa.nearBand && fa.nearBand.from ? fa.nearBand.from : (fa && fa.state === "few" && fa.option && fa.option.dimension === "mileage" ? { label: fa.option.label, n: fa.n } : null);
      return { cardLabel: fitLabel(best.label, sales(best.n), abbrevMonths(best.windowWords || m.window || "")), cardHeadline: figures(best.low, best.high),
        cardLine: fitLine(thin && thin.value !== best.value ? reasonLine("card.thin_band", { label: thin.label, count: sales(thin.n) }) + " " + reasonLine("card.band_pointer") : reasonLine("card.band_pointer")), cardBand: { dimension: "mileage", value: best.value } };
    }
    return { cardLabel: fitLabel("", sales(n), win), cardHeadline: ranged.length ? reasonLine("card.apart_headline") : reasonLine("card.thin_headline"), cardLine: dim === "mileage" ? reasonLine("card.band_pointer") : reasonLine("card.option_pointer", { noun: NOUN[dim] || "option" }), cardBand: null };
  }
  // thin: sales on record, too few for a range
  // a fence (the sales come mostly from one place, they sit in very different price ranges, ...): the engine's own thinLine is the line; only a plain "too few sales" gets the headline "Too few for a range"
  if (n > 0 && m.thinReason && m.thinReason !== "few_sales" && m.thinLine) return { cardLabel: fitLabel("", sales(n), win), cardHeadline: reasonLine("card.fence_headline"), cardLine: fitLine(m.thinReason === "pooled_apart" ? reasonLine("card.apart_line") : m.thinLine), cardBand: null };   // thin.pooled_apart tells Market Check's reader to pick; a card has nothing to pick, so it gets the card form
  if (n > 0) return { cardLabel: fitLabel("", sales(n), win), cardHeadline: reasonLine("card.thin_headline"), cardLine: fitLine(bid), cardBand: null };
  return { ...EMPTY, cardHeadline: reasonLine("card.none_headline"), cardLine: fitLine(m.answerLine) };
}
