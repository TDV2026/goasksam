// THE ONE WORDING TABLE FOR EVERY REASON LINE A VISITOR CAN READ (Oct 28 2026, e99). A line is plain English, one short sentence, no dashes, no first-person Sam, no "our data", no source counts, and none of the
// words rung, pool, cluster or set aside. Every engine producer builds its line here (reasonLine); no page writes one. scripts/reasonWordsCheck.mjs fails on a table line that breaks the style, on a producer
// that builds a line of its own, and on any line an answer carries that matches no entry of this table. `before` is the wording of the e98 build, kept so the notes can show before and after.
const money = x => "$" + Math.round(Number(x)).toLocaleString("en-US");
const n = x => (x === "" || x == null || Number.isNaN(Number(x))) ? String(x) : Number(x).toLocaleString("en-US");
// SENTENCES THE TABLE NO LONGER SAYS, AND WHAT SAYS THEM NOW (Oct 29 2026): a stored row keeps the sentence it was stored with; the engine's read-time restate (lib/onebox.js freshenStoredText) swaps each of these for the table's current line, so no warm is needed
// for a wording change. Add the old sentence here whenever a table line changes; scripts/storedTextCheck.mjs and scripts/reasonWordsCheck.mjs read this list.
// FIELDS THE ENGINE NO LONGER SENDS (Oct 29 2026): a stored row may still carry them; freshenStoredText deletes them so no page prints one. chartWindowLine ("The chart covers 15 months, the range the last 11.", Sam dropped it from every page).
export const RETIRED_FIELDS = ["chartWindowLine"];
export const RETIRED_LINES = [
  { old: "Too few of these sales match closely enough to show a range.", id: "thin.few_comparable" },
  { old: "Too few of these sales can be compared side by side to give a reliable range. These are the sales on record.", id: "thin.few_comparable" },
  { old: "Too few of these sales can be compared side by side to give a reliable range. These are the sales we found.", id: "thin.few_comparable" },
  { old: "The range is where most sales landed.", id: "footer.range" }   // Oct 29 2026 (Sam): the range is the middle half of the sales, so "most" claimed a share it does not cover
];
export const REASON_TABLE = {
  "thin.house_share":   { field: "thinLine", before: "The sales of this car are too one-sided to mark a range from. These are the sales on record.", text: () => "These sales come mostly from one place, so no range is shown." },
  "thin.few_sales":     { field: "thinLine", before: "Not enough sales of this exact car to give a reliable range. These are the sales on record.", text: () => "Too few sales to show a range." },
  "thin.mixed_prices":  { field: "thinLine", before: "These sales sit in very different price ranges, so no typical range is shown. These are the sales on record.", text: () => "These sales sit in very different price ranges, so no range is shown." },
  "thin.pooled_apart":  { field: "thinLine", before: "These sales split into options that sit in different price ranges, so no one typical range is shown. Pick an option below to read its own sales.", text: () => "These sales split into options priced apart, so pick one to see its range." },
  "thin.few_comparable":{ field: "thinLine", before: "Too few of these sales can be compared side by side to give a reliable range. These are the sales on record.", text: () => "Too few sales of this car to show a range." },   // Oct 29 2026 (Sam): was "Too few of these sales match closely enough to show a range." (see RETIRED_LINES)
  "wide.mileage":       { field: "wideLine", before: "Wide because 20,000 to 90,000 miles. Add yours.", text: p => `The range is wide because mileage runs from ${p.lo} to ${p.hi} miles.` },
  "wide.year":          { field: "wideLine", before: "Wide because these run from 2008 to 2014. Pick a year.", text: p => `The range is wide because the cars run from ${p.a} to ${p.b}.` },
  "wide.mods":          { field: "wideLine", before: "Wide because 4 of the 12 sales are modified cars.", text: p => `The range is wide because ${p.m} of the ${p.n} are modified cars.` },
  "wide.none":          { field: "wideLine", before: "These sell on condition and history more than mileage. Here are the twelve sales.", text: () => "These sales vary with condition and history more than with mileage." },
  "year.note":          { field: "yearNote", before: "No 2010 sales in this range. These are 2008 to 2009 cars.", text: p => `No ${p.y} sales here, only ${p.span} cars.` },
  "year.none_of":       { field: "yearNote", before: "None of these sales is a 2010; they are 2008 to 2009 cars.", text: p => `None of these sales is a ${p.y}, they are ${p.span} cars.` },
  "option.floor":       { field: "optionLines", before: "Convertible, 5 sales, too few for a range", text: p => `${p.label}, ${p.count}, too few for a range` },
  "option.range":       { field: "optionLines", before: "Coupe $20,000 to $30,000, 12 sales", text: p => `${p.label} ${p.low} to ${p.high}, ${p.count}` },
  "options.note":       { field: "optionsNote", before: "Each option's count is read over its own window, so the counts can add up to more than the headline count.", text: () => "Option counts use their own time spans, so they can add up to more than the total." },
  "mileage.note":       { field: "mileageNote", before: "Too few sales near 40,000 miles to narrow it. This is the range for all twelve.", text: p => `Too few sales near ${n(p.miles)} miles to narrow it, so this is the range for all ${p.count}.` },
  "chart.caption":      { field: "chartCaption", before: "By quarter, November 2023 to September 2026. Quarters with fewer than 5 sales are left out.", text: p => `By ${p.size}, ${p.span}, ${p.plural} under ${p.min} sales left out.` },
  "mileage.band":       { field: "mileageBand.line", before: "12 sales within 15,000 miles of 40,000, since December 2025. The band reads the last 12 months.", text: p => `${p.count} ${p.span}${p.window ? ", " + p.window : ""}.` },
  "chart.scope":        { field: "chart.scope.line", before: "(new in e99)", text: p => `The candles show the ${p.label} sales only, ${p.n} of the ${p.total}.` },
  "trend.prior_year":  { field: "trend.priorYearLine", before: "(written by the page from trend.priorYear.low and .high)", text: p => `The year before, the typical range was $${n(Math.round(Number(p.low)))} to $${n(Math.round(Number(p.high)))}.` },   // Oct 29 2026 (Sam): the engine writes it at read time; the page prints the field
  "exact.last_sale":   { field: "ownSales.lastSaleLine", before: "(written by the page from ownSales.lastSale)", text: p => `Its last sale, ${money(p.price)} in ${p.month}, sits ${p.placing}.` },
  "card.sold_before":  { field: "cards.soldBefore.line", before: "(written by the page from card.soldBefore)", text: p => `Sold before on ${p.when}${p.price ? " for " + money(p.price) : ""}` },
  "dist.sub":          { field: "distSubLine", before: "(written by the page from the pool size)", text: p => `Share of sales in each price band${p.count ? ", based on " + p.count : ""}.` },
  "facts.block":       { field: "factsBlock.line", before: "(written by the page from factsBlock)", text: p => p.text },
  "card.latest_quarter": { field: "latestQuarterLine", before: "(written by the card from the last quarter)", text: p => `Latest quarter: ${p.label}, ${money(p.low)} to ${money(p.high)} (${p.count})` },
  "vin.prior_sale":    { field: "vinMatch.priorSaleLine", before: "(written by the page from the match history)", text: p => p.text },
  "chart.latest":      { field: "chart.caption", before: "(a withheld chart printed its reason: the mix sentence or the too-few sentence)", text: () => "Latest sales" },   // Oct 29 2026 (Sam): a withheld chart prints no reason on any page; this heading sits where the caption was
  "chart.held":         { field: "chart.note", before: "The mix of cars changed from quarter to quarter, so a change here would not show the market moving.", text: () => "The mix of cars changed from quarter to quarter, so a change here would not show the market moving." },
  "chart.withheld_few": { field: "chart.withheld.line", before: "Only 2 dated sales, too few to chart, so the sales themselves are listed.", text: () => "There are too few sales in each period to draw a chart." },
  "find.count":         { field: "findAnswer.lines", before: "(new in e99)", text: p => `${p.count}${p.words ? " " + p.words : ""}.` },
  "find.near":          { field: "findAnswer.lines", before: "(new in e99)", text: p => `${p.count} near its miles.` },
  "find.bid":           { field: "findAnswer.lines", before: "(new in e99)", text: p => `The bid is ${p.pos} the range.` },
  "options.remainder":  { field: "optionsRemainder.line", before: "(new in e100)", text: p => `${p.count} ${p.count === 1 ? "sale " + p.what[0] : "sales " + p.what[1]}.` },
  "options.remainder_in":      { field: "optionsRemainder.line", before: "(new in e101)", text: p => `${p.count} ${p.count === 1 ? "sale is" : "sales are"} ${p.where}.` },
  "options.remainder_outside": { field: "optionsRemainder.line", before: "(new in e101)", text: p => `${p.count} ${p.count === 1 ? "sale falls" : "sales fall"} outside ${p.what}.` },
  "find.choice":               { field: "refusal_line", before: "(new in e101)", text: () => "Which version this is has to be settled first, so no figures are shown." },
  "find.unresolved":           { field: "answerLine", before: "(new in e101)", text: () => "The sales for this exact car cannot be read yet, so no figures are shown." },
  "find.doubtful":             { field: "refusal_line", before: "(new in e101)", text: () => "This listing may not be a whole car, so no figures are shown." },
  "footer.range":              { field: "rangeSentence", before: "The range is where most sales landed.", text: () => "The range is the middle of the market: a quarter of sales landed below it and a quarter above." },
  "vin.unresolved":            { field: "samLine", before: "(new in e101)", text: () => "This VIN does not name a car whose sales can be read, so no figures are shown." },
  "find.none":                 { field: "refusal_line", before: "(new in e101)", text: () => "No figures are shown for this car yet." },
  "way.model":                 { field: "wayOut.label", before: "(new in e101)", text: () => "Another model" },
  "way.model.ph":              { field: "wayOut.placeholder", before: "(new in e101)", text: () => "Which model?" },
  "way.trim":                  { field: "wayOut.label", before: "(new in e101)", text: () => "Another trim" },
  "way.trim.ph":               { field: "wayOut.placeholder", before: "(new in e101)", text: () => "Which trim?" },
  "way.body":                  { field: "wayOut.label", before: "(new in e101)", text: () => "Another body style" },
  "way.body.ph":               { field: "wayOut.placeholder", before: "(new in e101)", text: () => "Type the body style" },
  "way.generation":            { field: "wayOut.label", before: "(new in e101)", text: () => "Another generation or year" },
  "way.year":                  { field: "wayOut.label", before: "(new in e101)", text: () => "Another year" },
  "way.year.ph":               { field: "wayOut.placeholder", before: "(new in e101)", text: () => "Which year?" },
  "way.car":                   { field: "wayOut.label", before: "(new in e101)", text: () => "Another car" },
  "way.car.ph":                { field: "wayOut.placeholder", before: "(new in e101)", text: () => "Type the whole car" },
  "way.generation.ph":         { field: "wayOut.placeholder", before: "(new in e101)", text: () => "Which generation or year?" },
  "find.bid_sales":     { field: "bidPlace.line", before: "(new in e100)", text: p => p.pos === "within" ? "The bid is within the sales." : `The bid is ${p.pos} every sale.` },
  "find.few":           { field: "findAnswer.lines", before: "(new in e99)", text: p => `${p.count}, too few for a range.` },
  "find.split_unsaid":  { field: "findAnswer.lines", before: "(new in e99)", text: p => `${(p && p.groups) || "Cars like this"} sell for different money, and this listing does not say which it is, so there is no single range.` },
  "window.line":        { field: "windowLine", before: "12 sales, since December 2025.", text: p => `${p.count ? p.count + ", " : ""}${p.words}.` },
  "window.longer":      { field: "windowNote", before: "Based on 9 sales over the last 24 months.", text: p => `Based on ${p.count} over the last ${p.months} months.` },
  "basis.one":          { field: "basisLine", before: "Based on one sale, in March 2026.", text: p => `Based on one sale, in ${p.when}.` },
  "basis.since":        { field: "basisLine", before: "Based on nine sales since March 2025.", text: p => `Based on ${p.count} since ${p.when}.` },
  "basis.latest":       { field: "basisLine", before: "Based on nine sales, the latest in March 2026.", text: p => `Based on ${p.count}, the latest in ${p.when}.` },
  "basis.pool_one":     { field: "basisLine", before: "Based on one sale of 1995 911 Carrera, in March 2026.", text: p => `Based on one sale of ${p.pool}, in ${p.when}.` },
  "basis.pool_since":   { field: "basisLine", before: "Based on nine sales of 1995 911 Carrera since March 2025.", text: p => `Based on ${p.count} of ${p.pool} since ${p.when}.` },
  "basis.pool_latest":  { field: "basisLine", before: "Based on nine sales of 1995 911 Carrera, the latest in March 2026.", text: p => `Based on ${p.count} of ${p.pool}, the latest in ${p.when}.` },
  "latest.sale":        { field: "latestSaleLine", before: "Latest sale: March 2026.", text: p => `Latest sale: ${p.when}.` },
  "includes.from":      { field: "includesFromLine", before: "Includes sales from 2021.", text: p => `Includes sales from ${p.year}.` },
  "scope.typed":        { field: "scope_reason", before: "Showing the Coupe as named.", text: p => `Showing the ${p.kept} as named` },
  "scope.every":        { field: "scope_reason", before: "Showing every edition of this car.", text: p => `Showing every ${p.dim} of this car` },
  "scope.same_price":   { field: "scope_reason", before: "The editions of this car sell for about the same, showing every edition.", text: p => `The ${p.dim}s of this car sell for about the same, showing every ${p.dim}` },
  "scope.only_kept":    { field: "scope_reason", before: "Only the Coupe has three or more sales of this car, showing Coupe.", text: p => `Only the ${p.kept} has three or more sales of this car, showing ${p.kept}` },
  "scope.none_kept":    { field: "scope_reason", before: "No edition of this car has three sales on its own, showing every edition.", text: p => `No ${p.dim} of this car has three sales on its own, showing every ${p.dim}` },
  "scope.no_year":      { field: "scope_reason", before: "No 1974 sales yet, showing 1973.", text: p => `No ${p.y} sales yet, showing ${p.shown}` },
  "scope.few_year":     { field: "scope_reason", before: "Too few 2006 sales, showing 2005 to 2007.", text: p => `Too few ${p.y} sales, showing ${p.shown}` },
  "refusal.verify":     { field: "refusal_line", before: "Sam could not verify this one, so no figures are shown.", text: () => "No figures are shown because this car could not be checked." },
  "refusal.not_a_car":  { field: "refusal_line", before: "(new in e98: no line)", text: () => "This does not read as a car, so no figures are shown." },
  "refusal.varied":     { field: "refusal_line", before: "Sales too spread out for a range.", text: () => "These sales are too spread out to show a range." },
  "refusal.read_failed":{ field: "refusal_line", before: "The archive read did not finish. Try the search again in a moment.", text: () => "This could not be read just now, try again in a moment." },
  "refusal.no_body":    { field: "refusal_line", before: "The 993 911 was not sold as a Targa. If you mean a different body or a related model, tell me which and I'll pull the right sales.", text: p => `The ${p.gen} ${p.name} was not sold as a ${p.body}, try another body or a related model.` },
  "refusal.not_tracked":{ field: "refusal_line", before: "We haven’t tracked a 1995 911 Carrera sale yet. When one sells, it’ll show up here.", text: p => `No sale of ${p.article} ${p.name} has been tracked yet.` },
  "refusal.no_sales":   { field: "refusal_line", before: "No sales of a 1995 911 Carrera are on record in the last five years, so there is no range to show.", text: p => `No sales of ${p.article} ${p.title} are on record in the last five years, so there is no range to show.` },
  "refusal.builder":    { field: "refusal_line", before: "Singer cars are not compared with standard 911s, so Sam shows no range for this car.", text: () => "Singer cars are not compared with standard 911s, so no range is shown." },
  "cold.still":         { field: "cold_line", before: "Sam is still reading the sales for this one.", text: () => "The sales for this one are still being read." },
  "cold.reading":       { field: "cold_line", before: "Sam is reading the sales for this one.", text: () => "The sales for this one are being read." },
  "cold.missed":        { field: "cold_line", before: "Sam couldn't read this one yet.", text: () => "This one could not be read yet." },
  "stale.line":         { field: "staleLine", before: "Sales read on October 20. Sales since then are not in yet. Updating now.", text: p => `Sales read on ${p.date}, newer sales are being added.` }
};
export function reasonLine(id, p = {}) { const e = REASON_TABLE[id]; if (!e) throw new Error("reason line not in the table: " + id); return e.text(p); }
export const THIN_REASON_ID = { house_share: "thin.house_share", few_sales: "thin.few_sales", mixed_prices: "thin.mixed_prices", pooled_apart: "thin.pooled_apart", few_comparable: "thin.few_comparable" };
// every table line as a pattern, with its parameters as wildcards: a line an answer carries must match one
export function reasonPatterns() {
  return Object.entries(REASON_TABLE).map(([id, e]) => {
    const probe = new Proxy({}, { get: (_, k) => "\u0001" + String(k) + "\u0002" });
    let s; try { s = e.text(probe); } catch { s = ""; }
    const src = s.split(/\u0001[^\u0002]*\u0002/).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".+?");
    return { id, field: e.field, re: new RegExp("^" + src + "$") };
  });
}
export const STYLE_BANNED = [/[–—]/, /\bSam\b/, /\bour data\b/i, /\brung\b/i, /\bpool\b/i, /\bcluster\b/i, /\bset aside\b/i];
