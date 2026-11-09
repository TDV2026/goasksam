// THE ONE WORDING TABLE FOR EVERY REASON LINE A VISITOR CAN READ (Oct 28 2026, e99). A line is plain English, one short sentence, no dashes, no first-person Sam, no "our data", no source counts, and none of the
// words rung, pool, cluster or set aside. Every engine producer builds its line here (reasonLine); no page writes one. scripts/reasonWordsCheck.mjs fails on a table line that breaks the style, on a producer
// that builds a line of its own, and on any line an answer carries that matches no entry of this table. `before` is the wording of the e98 build, kept so the notes can show before and after.
const money = x => "$" + Math.round(Number(x)).toLocaleString("en-US");
export const moneyWords = money;   // the one dollar formatter: the Desk pages print figures with it, so no page carries its own
const n = x => (x === "" || x == null || Number.isNaN(Number(x))) ? String(x) : Number(x).toLocaleString("en-US");
// SENTENCES THE TABLE NO LONGER SAYS, AND WHAT SAYS THEM NOW (Oct 29 2026): a stored row keeps the sentence it was stored with; the engine's read-time restate (lib/onebox.js freshenStoredText) swaps each of these for the table's current line, so no warm is needed
// for a wording change. Add the old sentence here whenever a table line changes; scripts/storedTextCheck.mjs and scripts/reasonWordsCheck.mjs read this list.
// FIELDS THE ENGINE NO LONGER SENDS (Oct 29 2026): a stored row may still carry them; freshenStoredText deletes them so no page prints one. chartWindowLine ("The chart covers 15 months, the range the last 11.", Sam dropped it from every page).
export const RETIRED_FIELDS = ["chartWindowLine", "spreadLine"];   // spreadLine ("These sales vary widely, from X to Y.", Oct 29 2026): Sam replaced it with the two-sentence rangeSentence
// THE VENUE FENCE IS GONE (Nov 2 2026, lane-b-onevenue; Sam, Nov 4): house sales are sales, no answer says "mostly from one place". A stored row, core row or saved payload may still carry the fence's reason (house_share) or either of its sentences;
// the engine's read-time restate (lib/onebox.js restateRetired) gives it the reason its own sales count gives now, and the readers take such a row as no row. scripts/reasonWordsCheck.mjs fails on any producer that still holds one of these.
export const RETIRED_REASONS = ["house_share"];
export const ONE_PLACE_LINES = ["These sales come mostly from one place, so no range is shown.", "The sales of this car are too one-sided to mark a range from. These are the sales on record.", "The sales of this car are too one-sided to mark a range from. These are the sales we found."];
const FENCE_FIELDS = ["thinLine", "answerLine", "samLine", "refusal_line", "wideLine"];
export const carriesFence = o => !!o && typeof o === "object" && (RETIRED_REASONS.includes(o.thinReason) || FENCE_FIELDS.some(k => typeof o[k] === "string" && ONE_PLACE_LINES.some(l => o[k].includes(l))));
export const RETIRED_LINES = [
  { old: "Too few of these sales match closely enough to show a range.", id: "thin.few_comparable" },
  { old: "Too few of these sales can be compared side by side to give a reliable range. These are the sales on record.", id: "thin.few_comparable" },
  { old: "Too few of these sales can be compared side by side to give a reliable range. These are the sales we found.", id: "thin.few_comparable" }
];
// RETIRED SENTENCES THAT CARRY PARAMETERS (Nov 3 2026, lane-b-genline): a stored scope_reason keeps the machine wording it was stored with ("Showing every generation of this car"). Each entry reads the old form and says
// which table line now says it; lib/onebox.js freshenStoredText swaps it, so a wording change needs no warm. scripts/reasonWordsCheck.mjs reads this list.
export const RETIRED_PATTERNS = [
  { re: /^Showing the (.+) as named$/, id: "scope.typed", to: m => ({ kept: m[1] }) },
  { re: /^Showing every (.+) of this car$/, id: "scope.every", to: m => ({ dim: m[1] }) },
  { re: /^The (.+)s of this car sell for about the same, showing every \1$/, id: "scope.same_price", to: m => ({ dim: m[1] }) },
  { re: /^Only the (.+) has three or more sales of this car, showing \1$/, id: "scope.only_kept", to: m => ({ kept: m[1] }) },
  { re: /^No (.+) of this car has three sales on its own, showing every \1$/, id: "scope.none_kept", to: m => ({ dim: m[1] }) },
  { re: /^No (\d{4}) sales yet, showing (.+)$/, id: "scope.no_year", to: m => ({ y: m[1], shown: m[2] }) },
  { re: /^Too few (\d{4}) sales, showing (.+)$/, id: "scope.few_year", to: m => ({ y: m[1], shown: m[2] }) }
];
export const REASON_TABLE = {
  "thin.few_sales":     { field: "thinLine", before: "Not enough sales of this exact car to give a reliable range. These are the sales on record.", text: () => "Too few sales to show a range." },
  "thin.mixed_prices":  { field: "thinLine", before: "These sales sit in very different price ranges, so no typical range is shown. These are the sales on record.", text: () => "These sales sit in very different price ranges, so no range is shown." },
  "thin.pooled_apart":  { field: "thinLine", before: "These sales split into options that sit in different price ranges, so no one typical range is shown. Pick an option below to read its own sales.", text: () => "These sales split into options priced apart, so pick one to see its range." },
  "thin.few_comparable":{ field: "thinLine", before: "Too few of these sales can be compared side by side to give a reliable range. These are the sales on record.", text: () => "Too few sales of this car to show a range." },   // Oct 29 2026 (Sam): was "Too few of these sales match closely enough to show a range." (see RETIRED_LINES)
  "wide.mileage":       { field: "wideLine", before: "Wide because 20,000 to 90,000 miles. Add yours.", text: p => `The range is wide because mileage runs from ${p.lo} to ${p.hi} miles.` },
  "wide.year":          { field: "wideLine", before: "Wide because these run from 2008 to 2014. Pick a year.", text: p => `The range is wide because the cars run from ${p.a} to ${p.b}.` },
  "wide.period":        { field: "wideLine", before: "(none: the line named mileage while the chart showed the year split)", text: p => `The range is wide because ${p.label} spread to ${money(p.low)} to ${money(p.high)} from ${money(p.pLow)} to ${money(p.pHigh)} the year before.` },
  "wide.mileage_period": { field: "wideLine", before: "The range is wide because mileage runs from 44,000 to 98,000 miles.", text: p => `The range is wide because mileage runs from ${p.lo} to ${p.hi} miles and ${p.label} spread to ${money(p.low)} to ${money(p.high)} from ${money(p.pLow)} to ${money(p.pHigh)} the year before.` },
  "wide.mods":          { field: "wideLine", before: "Wide because 4 of the 12 sales are modified cars.", text: p => `The range is wide because ${p.m} of the ${p.n} are modified cars.` },
  "wide.none":          { field: "wideLine", before: "These sell on condition and history more than mileage. Here are the twelve sales.", text: () => "These sales vary with condition and history more than with mileage." },
  "year.note":          { field: "yearNote", before: "No 2010 sales in this range. These are 2008 to 2009 cars.", text: p => `No ${p.y} sales here, only ${p.span} cars.` },
  "year.none_of":       { field: "yearNote", before: "None of these sales is a 2010; they are 2008 to 2009 cars.", text: p => `None of these sales is a ${p.y}, they are ${p.span} cars.` },
  "option.floor":       { field: "optionLines", before: "Convertible, 5 sales, too few for a range", text: p => `${p.label}, ${p.count}, too few for a range` },
  "card.label":         { field: "cardLabel", before: "(new, Nov 3 2026, the Find card's three slots)", text: p => `${p.what ? p.what + ", " : ""}${p.count}${p.window ? " " + p.window : ""}` },
  "card.thin_band":     { field: "cardLine", before: "(new, Nov 3 2026)", text: p => `${p.label}: ${p.count}, too few.` },
  "card.band_pointer":  { field: "cardLine", before: "(new, Nov 3 2026)", text: () => "See the sales for each band." },
  "card.option_pointer":{ field: "cardLine", before: "(new, Nov 3 2026)", text: p => `See the sales for each ${p.noun}.` },
  "card.apart_headline":{ field: "cardHeadline", before: "(new, Nov 3 2026)", text: () => "Priced apart" },
  "card.thin_headline": { field: "cardHeadline", before: "(new, Nov 3 2026)", text: () => "Too few for a range" },
  "card.apart_line":   { field: "cardLine", before: "(new, Nov 3 2026, the card form of thin.pooled_apart: a card has nothing to pick)", text: () => "These sales split into options priced apart. See the sales to compare them." },
  "card.short_split_unsaid": { field: "cardLine", before: "(new, Nov 3 2026, the card form of find.split_unsaid)", text: () => "Which version this is changes the price, so no range is shown." },
  "card.short_no_sales":     { field: "cardLine", before: "(new, Nov 3 2026, the card form of refusal.no_sales)", text: () => "No sales on record in the last five years." },
  "card.short_no_body":      { field: "cardLine", before: "(new, Nov 3 2026, the card form of refusal.no_body)", text: () => "That body was not sold for this car, try another." },
  "card.short_not_tracked":  { field: "cardLine", before: "(new, Nov 3 2026, the card form of refusal.not_tracked)", text: () => "No sale of this car has been tracked yet." },
  "card.fence_headline":{ field: "cardHeadline", before: "(new, Nov 3 2026)", text: () => "No range shown" },
  "card.none_headline": { field: "cardHeadline", before: "(new, Nov 3 2026)", text: () => "No sales yet" },
  "card.not_tracked_headline": { field: "cardHeadline", before: "(new, Nov 3 2026)", text: () => "Not tracked" },
  "card.refused_headline": { field: "cardHeadline", before: "(new, Nov 3 2026)", text: () => "Not read" },
  "card.unmatched_headline": { field: "cardHeadline", before: "(new, Nov 3 2026)", text: () => "Not matched" },
  "card.unmatched_line": { field: "cardLine", before: "Sam could not match this listing to a car yet.", text: () => "This listing could not be matched to a car yet." },
  "option.pick_floor":  { field: "options.pickLine", before: "(new, Nov 3 2026, the popup heading after a pick of a thin option)", text: p => `${p.label}: ${p.count}, too few for a range.` },
  "option.chip_range":  { field: "chipLines", before: "(new, Nov 3 2026, the popup chip)", text: p => `${p.label}, ${p.low} to ${p.high}, ${p.count}` },
  "option.chip_floor":  { field: "chipLines", before: "(new, Nov 3 2026, the popup chip)", text: p => `${p.label}, ${p.count}` },
  "option.body_unstated_label": { field: "bodyNotStated", before: "(new, Nov 5 2026, pre-war bodies at any size)", text: () => "Body not stated" },
  "option.body_unstated": { field: "bodyNotStated", before: "(new, Nov 5 2026, pre-war bodies at any size)", text: p => `Body not stated, ${p.count}` },
  "norange.few_sales": { field: "noRangeLine", before: "(new, Nov 5 2026, the no-range card, approved by Sam)", text: p => `${p.total}${p.window ? " " + p.window : ""}, too few for a range.` },
  "norange.few_comparable": { field: "noRangeLine", before: "(new, Nov 5 2026, the no-range card, approved by Sam with the number tied to the count)", text: p => `${p.total}${p.window ? " " + p.window : ""}. ${p.closeLead}, too few for a range.` },
  "norange.few_comparable_house": { field: "noRangeLine", before: "(new, Nov 5 2026, the no-range card, house sales counted)", text: p => `${p.total}${p.window ? " " + p.window : ""}. ${p.close} ${p.closeOne ? "is an online sale with a photo or a house sale" : "are online sales with a photo or house sales"}, too few for a range.` },
  "norange.varied": { field: "noRangeLine", before: "(new, Nov 5 2026, the no-range card, approved by Sam)", text: p => `${p.total}${p.window ? " " + p.window : ""}, too spread out for a range.` },
  "norange.options_apart": { field: "noRangeLine", before: "(new, Nov 5 2026, the no-range card, approved by Sam)", text: p => `${p.total}${p.window ? " " + p.window : ""}, sold as different cars, so no one range.` },
  "option.range":       { field: "optionLines", before: "Coupe $20,000 to $30,000, 12 sales", text: p => `${p.label} ${p.low} to ${p.high}, ${p.count}` },
  "options.note":       { field: "optionsNote", before: "Each option's count is read over its own window, so the counts can add up to more than the headline count.", text: () => "Each option is counted over its own time span, so the counts can add up to more than the total." },
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
  // THE TASKS CENTREPIECE DEMO TWO NUMBER LINES (Lane B, Nov 6 2026; Lane E's numberSentenceCheck forbids a page writing them): the live bid and the earlier sale, written once here from the engine's own dollar figures.
  "tasks.demo_current_bid": { field: "demo.car.priceLabel", before: "(written by the demo from the live bid)", text: p => `Current bid ${money(p.price)}` },
  "tasks.demo_miles":  { field: "demo.car.mileageLine", before: "(written by the page from car.mileage)", text: p => `${Math.round(Number(p.miles)).toLocaleString("en-US")} miles` },   // the words the Find card uses: "4,783 miles"
  "tasks.demo_prior_miles": { field: "demo.previous.mileageLine", before: "(written by the page from previous.mileage)", text: p => `${Math.round(Number(p.miles)).toLocaleString("en-US")} miles at that sale` },
  // THE FIND EXAMPLES, THE WATCHING CARD AND THE SHORT REQUEST (Lane B, Nov 7 2026; Lane E's names): the time left, the ending-soon status and the short form of the Task request, written once here. Nothing says a reminder or an alert was sent.
  "demo.time_left":     { field: "timeLine", before: "(written by the page from endsAt)", text: p => { const ms = Number(p.ms); const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5), m = Math.max(1, Math.floor(ms / 6e4)); return d >= 1 ? `${d} ${d === 1 ? "day" : "days"} left` : h >= 1 ? `${h} ${h === 1 ? "hour" : "hours"} left` : `${m} ${m === 1 ? "minute" : "minutes"} left`; } },
  "demo.ending_soon":   { field: "status", before: "(written by the page from endsAt)", text: () => "Auction ending soon" },
  "tasks.demo_request_short": { field: "shortRequest", before: "(written by the page from the request)", text: p => { const words = [p.colour, p.gearbox === "manual" ? "manual" : p.gearbox ? "automatic" : null, p.make, p.model].filter(Boolean).join(" "); const b = Number(p.budget); const short = b >= 1e6 ? "$" + String(Math.round(b / 1e5) / 10).replace(/\.0$/, "") + "M" : b >= 1000 ? "$" + String(Math.round(b / 100) / 10).replace(/\.0$/, "") + "k" : "$" + Math.round(b); return `${/^[aeiou]/i.test(words) ? "An" : "A"} ${words}${b > 0 ? ` under ${short}` : ""}`; } },
  // THE ENDED / RECENT-EXAMPLE FALLBACKS (Lane B, Nov 8 2026): the words a page prints on a card that is a record, never a live car. The figure in each is the one recorded when the car was last proved or the sale price in the archive; nothing is estimated.
  "demo.sold_for":      { field: "the Find fallback items, priceLabel", before: "(none: the fallback is new)", text: p => `Sold for ${money(p.price)}` },
  "demo.sold_date":     { field: "the Find fallback items, dateLine", before: "(none: the fallback is new)", text: p => `Sold ${p.when}` },
  "demo.ended":         { field: "the Tasks and watching fallbacks, status", before: "(none: the fallback is new)", text: () => "Ended" },
  "demo.recent_example": { field: "the Tasks and watching fallbacks, label", before: "(none: the fallback is new)", text: () => "Recent example" },
  "demo.last_bid":      { field: "the Tasks and watching fallbacks, car.priceLabel", before: "(none: the fallback is new)", text: p => `Last bid ${money(p.price)}` },
  // THE SOLD LINE ON A FALLBACK CARD (Lane B, Nov 8 2026): the card prints SOLD FOR <price> <when>; the two parts are the archive's sale price and sale date, worded here.
  "demo.sold_price":    { field: "the Find and Tasks fallback cards, card.sold.price", before: "(none: new)", text: p => money(p.price) },
  "demo.sold_when":     { field: "the Find and Tasks fallback cards, card.sold.when", before: "(none: new)", text: p => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(p.date || "")); const MON = ["January","February","March","April","May","June","July","August","September","October","November","December"]; return m && MON[Number(m[2]) - 1] ? `${MON[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : String(p.date || ""); } },
  // THE DESK SHEET'S EVIDENCE LINES (Lane B, Nov 8 2026): the Desk states the count and the range, never an apology. These are separate entries from the consumer pages' lines (thin.*, mileage.note), which are unchanged.
  "desk.pool_tier":     { field: "condition.tooFewLine, market.poolLine", before: "Too few sales in this condition, so the wider pool is shown and there is no starting figure.", text: p => `${p.sales} of this body${p.since ? " since " + p.since : ""}, ${Number(p.m).toLocaleString("en-US")} in tier ${p.tier}, shown on the full set.` },
  "desk.range":         { field: "market.rangeLine", before: "Wider range: $low to $high (N sales).", text: p => `Range from ${p.sales}: ${money(p.low)} to ${money(p.high)}, median ${money(p.median)}.` },
  "desk.pick_tier":     { field: "market.startingNote", before: "Pick a condition tier for a starting figure.", text: () => "Pick a condition tier for a starting figure." },
  "desk.no_tier_data":  { field: "market.startingNote", before: "Condition tiers are not assigned to these sales yet.", text: () => "No condition tiers are assigned to these sales yet." },
  "desk.untiered":      { field: "condition.untieredLine", before: "Untiered: N stay in the wider pool.", text: p => `${Number(p.n).toLocaleString("en-US")} untiered, counted in the full set and in no tier.` },
  "desk.reasons_tier":  { field: "decision.missing reasons", before: "Too few sales in this condition: tick at least one reason.", text: p => `Tier ${p.tier} holds ${Number(p.m).toLocaleString("en-US")} of ${p.sales} and has no range of its own: tick at least one reason.` },
  "desk.pdf_full":      { field: "report comparables heading", before: "The wider pool, newest first.", text: p => `All ${p.sales} of this body, newest first, ${Number(p.m).toLocaleString("en-US")} in tier ${p.tier}.` },
  "desk.pdf_tier":      { field: "report comparables heading", before: "The same tier pool, newest first.", text: p => `The ${p.sales} in tier ${p.tier}, newest first.` },
  "desk.pdf_full_notier": { field: "report comparables heading", before: "The wider pool, newest first.", text: p => `All ${p.sales} of this body, newest first.` },
  "desk.window_fallback": { field: "market.window.stated suffix", before: "(the wider window, stated)", text: () => "(the longer window, stated)" },
  // THE ENTRY PAGE EXAMPLES (Lane B, Nov 8 2026): the sentences over the Market Check and Sell entry examples. Past sales only, no promise of a price.
  "entry.mc_line":      { field: "marketCheckExampleSales.line", before: "(none: new)", text: p => `Three of the ${p.sales} of this model${p.since ? " since " + p.since : ""} sold for ${money(p.pLo)} to ${money(p.pHi)}, at ${p.lo} to ${p.hi} miles.` },
  "entry.sell_line":    { field: "sellExample.line", before: "(none: new)", text: p => `${p.sales} of ${p.cohort}${p.window ? " " + p.window : ""}, by where they sold.` },
  "entry.sell_range":   { field: "sellExample.platforms[].rangeLine", before: "(none: new)", text: p => `Typical range ${money(p.lo)} to ${money(p.hi)}.` },
  "entry.sell_note":    { field: "sellExample.note", before: "(none: new)", text: () => "These are sales that happened, not a promise of a price." },
  "tasks.demo_prior_price": { field: "demo.previous.priceLine", before: "(written by the page from previous.price)", text: p => `Previously sold for ${money(p.price)}` },
  // THE FIGURE LINES OF THE CREW PREVIEWS (Lane E, Nov 6 2026): the history band and the Tasks example print these as given; the engine builds them, no page writes one.
  "history.miles":     { field: "history.current.mileageLine", before: "(written by the page from the mileage number)", text: p => `${n(p.miles)} miles` },
  "history.sold_for":  { field: "history.previous.priceLine", before: "(written by the page from the price number)", text: p => `Sold for ${money(p.price)}` },
  "history.now_miles": { field: "history.nowLine", before: "(written by the page from the mileage number and the words)", text: p => `Now ${n(p.miles)} miles (${p.words})` },
  "vin.prior_sale":    { field: "vinMatch.priorSaleLine", before: "(written by the page from the match history)", text: p => p.text },
  "chart.latest":      { field: "chart.caption", before: "(a withheld chart printed its reason: the mix sentence or the too-few sentence)", text: () => "Latest sales" },   // Oct 29 2026 (Sam): a withheld chart prints no reason on any page; this heading sits where the caption was
  "chart.held":         { field: "chart.note", before: "The mix of cars changed from quarter to quarter, so a change here would not show the market moving.", text: () => "The mix of cars changed from quarter to quarter, so a change here would not show the market moving." },
  "chart.withheld_few": { field: "chart.withheld.line", before: "Only 2 dated sales, too few to chart, so the sales themselves are listed.", text: () => "There are too few sales in each period to draw a chart." },
  "find.count":         { field: "findAnswer.lines", before: "(new in e99)", text: p => `${p.count}${p.words ? " " + p.words : ""}.` },
  "find.near":          { field: "findAnswer.lines", before: "(new in e99)", text: p => `${p.count} near its miles.` },
  "find.near_band":    { field: "findAnswer.lines", before: "Few sales {band}. Pick a mileage band to see its range.", text: p => `Few sales ${p.thin}. See the sales to compare the bands.` },
  "nearband.line":     { field: "nearBand.line", before: "(new in e102)", text: p => `Few sales ${p.thin}. Pick a mileage band to see its range.` },
  "typed.applied":     { field: "typedAttributes.words", before: "(new in e102)", text: p => `Only the sales that say ${p.label} are counted here: ${p.matched} of ${p.of}.` },
  "typed.not_carried": { field: "typedAttributes.words", before: "(new in e102)", text: p => `Sales do not say their ${p.noun}, so Sam could not filter by ${p.label}.` },
  "typed.excluded":           { field: "typedAttributes.words", before: "(new in e103)", text: p => `Left out the sales that say ${p.label}: ${p.removed} of ${p.of}.` },
  "typed.excluded_partial":   { field: "typedAttributes.words", before: "(new in e103)", text: p => `Left out the ${p.removed} of ${p.of} sales that say ${p.label}, though sales often stay silent on it, so a silent sale may still have it.` },
  "typed.exclude_none":       { field: "typedAttributes.words", before: "(new in e103)", text: p => `No sale here says ${p.label}, so none was left out.` },
  "typed.exclude_none_partial": { field: "typedAttributes.words", before: "(new in e103)", text: p => `Sales do not say ${p.label}, so none could be left out and the range includes every sale.` },
  "find.zip_unplaced":        { field: "meta.zipUnplaced", before: "(new, Nov 3 2026, Closest to me with a ZIP the engine has no place for)", text: () => "That ZIP could not be placed, so the cars stay in the order they were in." },
  "find.excluded":            { field: "excluded.line", before: "(new in e103)", text: p => `Left out ${p.removed === 1 ? "1 listing" : p.removed + " listings"} that say ${p.label}.` },
  "find.excluded_partial":    { field: "excluded.line", before: "(new in e103)", text: p => `Left out ${p.removed === 1 ? "1 listing" : p.removed + " listings"} that say ${p.label}, though listings often stay silent on it.` },
  "find.exclude_none":        { field: "excluded.line", before: "(new in e103)", text: p => `No listing here says ${p.label}, so none was left out.` },
  "find.exclude_none_partial":{ field: "excluded.line", before: "(new in e103)", text: p => `Listings do not say ${p.label}, so none could be left out.` },
  "typed.set_aside":   { field: "typedAttributes.words", before: "(new in e102)", text: p => `Swapped engines and restomods are left out of every read, so there is nothing to filter by ${p.label}.` },
  "find.bid":           { field: "findAnswer.lines", before: "(new in e99)", text: p => `The bid is ${p.pos} the range.` },
  "options.remainder":  { field: "optionsRemainder.line", before: "(new in e100)", text: p => `${p.count} ${p.count === 1 ? "sale " + p.what[0] : "sales " + p.what[1]}.` },
  "options.remainder_in":      { field: "optionsRemainder.line", before: "(new in e101)", text: p => `${p.count} ${p.count === 1 ? "sale is" : "sales are"} ${p.where}.` },
  "options.remainder_outside": { field: "optionsRemainder.line", before: "(new in e101)", text: p => `${p.count} ${p.count === 1 ? "sale falls" : "sales fall"} outside ${p.what}.` },
  "find.choice":               { field: "refusal_line", before: "(new in e101)", text: () => "Which version this is has to be settled first, so no figures are shown." },
  "find.unresolved":           { field: "answerLine", before: "(new in e101)", text: () => "The sales for this exact car cannot be read yet, so no figures are shown." },
  "find.doubtful":             { field: "refusal_line", before: "(new in e101)", text: () => "This listing may not be a whole car, so no figures are shown." },
  "footer.range":              { field: "rangeSentence", before: "The range is where most sales landed.", text: p => `Half of the ${p.count}${p.window ? " " + p.window : ""} landed in this range. The rest ran from ${p.low} to ${p.high}.` },   // Oct 29 2026 (Sam): the range is the middle half; the lowest and highest are the pool's real sales, never rounded
  "trim.fallback":             { field: "trimFallbackLine", before: "(new in e101)", text: p => `Too few ${p.car} sales for a range. Here is the ${p.model} market instead.` },   // Oct 29 2026 (Sam): a typed trim with too few sales of its own reads the model's market and says so; another trim's range is never presented as the typed car's
  "footer.updated":            { field: "updatedLine", before: "(new in e101)", text: p => `Updated ${p.date}.` },
  "find.bid_time":             { field: "findAnswer.lines", before: "(new in e101)", text: p => `The bid is ${p.pos} the range with ${p.left} left.` },
  "find.bid_sales_time":       { field: "bidPlace.line", before: "(new in e101)", text: p => p.pos === "within" ? `The bid is within the sales with ${p.left} left.` : `The bid is ${p.pos} every sale with ${p.left} left.` },
  "find.bid_none":             { field: "findAnswer.lines", before: "(new in e101)", text: () => "No bids yet." },
  "find.sold":                 { field: "findAnswer.lines", before: "(new in e101)", text: p => `Sold ${p.pos} the range.` },
  "vin.ask":                   { field: "vinAskLine", before: "(new in e101)", text: p => `The VIN does not say which ${p.word} this car is, so the ${p.word} is the only question.` },
  "vin.ask_narrow":            { field: "vinAskLine", before: "(new in e101)", text: p => `Going by the VIN, only these ${p.word}s are possible, so only these are listed.` },
  "miles.range_at":           { field: "rangeMileage.line", before: "(new in e103)", text: p => `Range at ${p.miles} miles, ${p.source}.` },
  "vin.ruled_out":             { field: "vinRuledOutLine", before: "(new in lane-b-vinpool)", text: () => "The VIN\u2019s own code settles which trims this car can be, so the sales of the other trims are not in this range." },
  "miles.all":                { field: "mileageLine", before: "(new in lane-b-vinpool)", text: () => "The range is for all mileages." },
  "miles.matched_at":         { field: "rangeMileage.line", before: "(new in e103)", text: p => `The range is for all mileages, and the closest sales are matched at ${p.miles} miles, ${p.source}.` },
  "miles.nearest":           { field: "nearestSalesHeading", before: "(new in e103)", text: p => `Closest sales to this car, matched at ${p.miles} miles.` },
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
  "find.split_unsaid":  { field: "findAnswer.lines", before: "Manual and Tiptronic cars sell for different money, and this listing does not say which it is, so there is no single range.", text: p => `This listing doesn't say which ${(p && p.car) || "car"} it is, and they sell for different money, so there's no single range.` },   // Oct 30 2026 (Sam): plain words, no list of years or groups as the subject
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
  "scope.typed":        { field: "scope_reason", before: "Showing the Coupe as named.", text: p => `Only the ${p.kept} is counted here, as asked.` },
  "scope.every":        { field: "scope_reason", before: "Showing every edition of this car.", text: p => `Every ${p.dim} of this car is counted here.` },
  "scope.same_price":   { field: "scope_reason", before: "The editions of this car sell for about the same, showing every edition.", text: p => `Every ${p.dim} of this car sells for about the same, so they're all counted here.` },
  "scope.only_kept":    { field: "scope_reason", before: "Only the Coupe has three or more sales of this car, showing Coupe.", text: p => `Only the ${p.kept} has three or more sales of this car, so that's the one counted here.` },
  "scope.none_kept":    { field: "scope_reason", before: "No edition of this car has three sales on its own, showing every edition.", text: p => `No ${p.dim} of this car has three sales on its own, so every ${p.dim} is counted here.` },
  "scope.no_year":      { field: "scope_reason", before: "No 1974 sales yet, showing 1973.", text: p => `There are no ${p.y} sales yet, so ${p.shown} cars are counted here.` },
  "scope.few_year":     { field: "scope_reason", before: "Too few 2006 sales, showing 2005 to 2007.", text: p => `There are too few ${p.y} sales, so ${p.shown} cars are counted here.` },
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
  // DESK V3 STAGE 3, THE REPORT'S SENTENCES (Lane D, Nov 8 2026): every sentence the report prints about the CASE, written here once; lib/desk/reportState.js picks the line from the case's own state and passes the case's own values. Nothing is true here that the case does not say.
  "report.range":        { field: "report.rangeLine", before: "(new, Nov 8 2026)", text: p => `Likely selling price range ${money(p.low)} to ${money(p.high)}.` },
  "report.reserve":      { field: "report.reserveLine", before: "(new, Nov 8 2026)", text: p => `Recommended reserve ${money(p.figure)}.` },
  "report.typical":      { field: "report.typicalLine", before: "(new, Nov 8 2026)", text: p => `The typical range is ${money(p.q1)} to ${money(p.q3)}, median ${money(p.median)}, from ${p.sales}.` },
  "report.reserve_below":{ field: "report.reservePositionLine", before: "(new, Nov 8 2026)", text: p => `The reserve sits below the typical range of ${money(p.q1)} to ${money(p.q3)}.` },
  "report.reserve_inside":{ field: "report.reservePositionLine", before: "(new, Nov 8 2026)", text: p => `The reserve sits inside the typical range of ${money(p.q1)} to ${money(p.q3)}.` },
  "report.reserve_above":{ field: "report.reservePositionLine", before: "(new, Nov 8 2026)", text: p => `The reserve sits above the typical range of ${money(p.q1)} to ${money(p.q3)}.` },
  "report.seller_agreed":{ field: "report.sellerLine", before: "(new, Nov 8 2026)", text: () => "The seller has agreed to this reserve." },
  "report.ims_reported": { field: "report.imsLine", before: "(new, Nov 8 2026)", text: () => "IMS work is reported by the seller, and the invoices are outstanding." },
  "report.ims_documented":{ field: "report.imsLine", before: "(new, Nov 8 2026)", text: () => "IMS work is documented by the service invoices received." },
  "report.mileage_verified":{ field: "report.mileageLine", before: "(new, Nov 8 2026)", text: p => `Mileage of ${p.miles} is verified.` },
  "report.mileage_stated":{ field: "report.mileageLine", before: "(new, Nov 8 2026)", text: p => `Mileage of ${p.miles} is as stated by the seller.` },
  "report.mileage_unconfirmed":{ field: "report.mileageLine", before: "(new, Nov 8 2026)", text: p => `Mileage of ${p.miles} is not confirmed.` },
  "report.assess_above":{ field: "report.differenceLine", before: "(new, Nov 8 2026)", text: p => `The assessment is ${money(p.diff)} above the market reference of ${money(p.reference)}.` },
  "report.assess_below":{ field: "report.differenceLine", before: "(new, Nov 8 2026)", text: p => `The assessment is ${money(p.diff)} below the market reference of ${money(p.reference)}.` },
  "report.assess_same": { field: "report.differenceLine", before: "(new, Nov 8 2026)", text: p => `The assessment is at the market reference of ${money(p.reference)}.` },
  "report.quarter":     { field: "report.quarterLines", before: "(new, Nov 8 2026)", text: p => `${p.label}: median ${money(p.median)} from ${p.sales}.` },
  "report.live_bid":    { field: "report.liveLines", before: "(new, Nov 8 2026)", text: p => `Bid ${money(p.figure)} on ${p.platform}${p.ends ? ", ends " + p.ends : ""}: ${p.title}.` },
  "report.live_ask":    { field: "report.liveLines", before: "(new, Nov 8 2026)", text: p => `Asking ${money(p.figure)} on ${p.platform}: ${p.title}.` },
  "report.live_nosale": { field: "report.liveLines", before: "(new, Nov 8 2026)", text: p => `Not sold on ${p.platform}: ${p.title}.` },
  "report.condition":    { field: "report.conditionLine", before: "(new, Nov 8 2026)", text: p => `Condition ${p.name}, tier ${p.tier} of 4: ${String(p.line).replace(/^./, c => c.toLowerCase())}.` },
  "report.limit_open":   { field: "report.limitations", before: "(new, Nov 8 2026)", text: p => `Open: ${p.label}.` },
  "report.limit_waived": { field: "report.limitations", before: "(new, Nov 8 2026)", text: p => `Waived: ${p.label}, reason given: ${String(p.reason).replace(/[.\s]+$/, "")}.` },
  "report.next_invoices":{ field: "report.nextSteps", before: "(new, Nov 8 2026)", text: () => "Send the service invoices." },
  "report.next_mileage": { field: "report.nextSteps", before: "(new, Nov 8 2026)", text: () => "Confirm the mileage." },
  "report.next_reserve": { field: "report.nextSteps", before: "(new, Nov 8 2026)", text: () => "Agree the reserve with the seller." },
  "report.next_none":    { field: "report.nextSteps", before: "(new, Nov 8 2026)", text: () => "No further steps are open." },
  "desk.no_prior_vin":   { field: "exact.none, report.noteLine", before: "No prior auction record for this VIN.", text: () => "No prior auction record for this VIN." },
  "desk3.population":  { field: "desk.evidence.population.sentence", before: "(new, Nov 8 2026)", text: p => `These are the sales of ${p.what}.` },
  "desk3.stale":      { field: "desk.evidence.stale.sentence", before: "(new, Nov 8 2026)", text: p => `The evidence runs to ${p.asOf}, ${p.days} before the case date, over the limit of ${p.threshold}.` },
  "desk3.insufficient":{ field: "desk.evidence.sentence", before: "(new, Nov 8 2026)", text: p => `There are too few sales of ${p.what} to give a reference, ${p.count} on record.` },
  "desk3.why":         { field: "desk.comparables.why", before: "(new, Nov 8 2026)", text: p => `${p.year}, ${p.miles}.` },
  "desk3.why_tier":    { field: "desk.comparables.why", before: "(new, Nov 8 2026)", text: p => `${p.year}, ${p.miles}, ${p.tier}.` },
  "desk3.why_nomiles": { field: "desk.comparables.why", before: "(new, Nov 8 2026)", text: p => `${p.year}, miles not stated.` },
  "desk3.why_nobox":   { field: "desk.comparables.why", before: "(new, Nov 8 2026)", text: p => `${p.year}, ${p.miles}, gearbox not stated.` },
  "desk3.outside_less":{ field: "desk.outside.sentence", before: "(new, Nov 8 2026)", text: p => `${p.group} cars sold for about ${money(p.diff)} less than ${p.mine} ones, ${p.m} against ${p.n}.` },
  "desk3.outside_more":{ field: "desk.outside.sentence", before: "(new, Nov 8 2026)", text: p => `${p.group} cars sold for about ${money(p.diff)} more than ${p.mine} ones, ${p.m} against ${p.n}.` },
  "desk3.outside_same":{ field: "desk.outside.sentence", before: "(new, Nov 8 2026)", text: p => `${p.group} cars sold for about the same as ${p.mine} ones, ${p.m} against ${p.n}.` },
  "desk3.cond_signals":{ field: "desk.condition.basis", before: "(new, Nov 8 2026)", text: p => `Suggested ${p.name} from ${p.notes} and ${p.miles}, ${p.count} counted.` },
  "desk3.cond_miles":  { field: "desk.condition.basis", before: "(new, Nov 8 2026)", text: p => `Suggested ${p.name} from ${p.miles}, ${p.count} counted.` },
  "desk3.cond_record": { field: "desk.condition.basis", before: "(new, Nov 8 2026)", text: p => `Suggested ${p.name} from the last listing of this car, ${p.count} counted.` },
  "desk3.cond_nearby": { field: "desk.condition.basis", before: "(new, Nov 8 2026)", text: p => `Suggested ${p.name}, as ${p.k} of the ${p.t} near ${p.miles} sold in that condition.` },
  "desk3.cond_none":   { field: "desk.condition.basis", before: "(new, Nov 8 2026)", text: p => `No condition is suggested, ${p.count} counted and ${p.min} are needed.` },
  "desk3.effect":      { field: "desk.factors.effectSentence", before: "(new, Nov 8 2026)", text: p => `${p.a} sold for about ${money(p.diff)} ${p.dir} than ${p.b}, ${p.m} against ${p.n}.` },
  "desk3.effect_same": { field: "desk.factors.effectSentence", before: "(new, Nov 8 2026)", text: p => `${p.a} sold for about the same as ${p.b}, ${p.m} against ${p.n}.` },
  "desk3.move":        { field: "desk.factors.effectSentence", before: "(new, Nov 8 2026)", text: p => `The median moved from ${money(p.from)} in ${p.q1} to ${money(p.to)} in ${p.q2}, ${p.m} against ${p.n}.` },
  "desk3.basis_isolated":{ field: "desk.factors.basis", before: "(new, Nov 8 2026)", text: p => `Read from ${p.m} against ${p.n} of the same generation and body.` },
  "desk3.basis_few":   { field: "desk.factors.basis", before: "(new, Nov 8 2026)", text: p => `${p.a} number ${p.m} and ${p.b} ${p.n}, and ${p.min} of each are needed to isolate an effect.` },
  "desk3.basis_overlap":{ field: "desk.factors.basis", before: "(new, Nov 8 2026)", text: p => `The prices of ${p.a} and ${p.b} overlap too much to isolate an effect, ${p.m} against ${p.n}.` },
  "desk3.basis_unread":{ field: "desk.factors.basis", before: "(new, Nov 8 2026)", text: p => `The sales do not record ${p.what}, so no effect can be isolated.` },
  "desk3.basis_nomiles":{ field: "desk.factors.basis", before: "(new, Nov 8 2026)", text: () => "No mileage was given, so no mileage effect is read." },
  "desk3.basis_ims_unread":{ field: "desk.factors.basis", before: "(new, Nov 8 2026)", text: p => `Only ${p.read} of the ${p.total} say whether IMS work was done, too few to isolate an effect.` },
  "desk3.basis_ims_none":{ field: "desk.factors.basis", before: "(new, Nov 8 2026)", text: p => `None of the ${p.total} say whether IMS work was done, so no effect can be isolated.` },
  "desk3.basis_ims_overlap":{ field: "desk.factors.basis", before: "(new, Nov 8 2026)", text: p => `${p.k} of ${p.t} mention IMS work, prices overlap too much to isolate an effect.` },
  "desk3.basis_ims_few":{ field: "desk.factors.basis", before: "(new, Nov 8 2026)", text: p => `${p.k} of ${p.t} mention IMS work, too few of each to isolate an effect.` },
  "desk3.basis_move_few":{ field: "desk.factors.basis", before: "(new, Nov 8 2026)", text: () => "Fewer than two quarters have enough sales to show a movement." },
  "entry.sell_car":    { field: "sellExample.cars[].line", before: "(none: new)", text: p => `${p.sales}${p.window ? " " + p.window : ""}: ${p.split}.` },
  "stale.line":         { field: "staleLine", before: "Sales read on October 20. Sales since then are not in yet. Updating now.", text: p => `Sales read on ${p.date}, newer sales are being added.` }
};
// THE WORDS OF A DESK POPULATION (Nov 8 2026, Desk v3): "manual coupes in Good condition from 41,400 to 81,400 miles", built from the subject's own facts, one place
export function deskPopulationWords(s = {}) {
  const parts = [s.transmission ? String(s.transmission).toLowerCase() : null, s.body ? String(s.body).toLowerCase() + "s" : "cars"].filter(Boolean).join(" ");
  const tail = [s.tierName ? `in ${s.tierName} condition` : null, s.miMin != null && s.miMax != null ? `from ${n(s.miMin)} to ${n(s.miMax)} miles` : s.miMin != null ? `over ${n(s.miMin)} miles` : s.miMax != null ? `up to ${n(s.miMax)} miles` : null].filter(Boolean).join(" ");
  return [parts, tail].filter(Boolean).join(" ");
}
// the small phrases of a Desk comparable's reason (Nov 8 2026): the year, the miles and the tier against the subject, in words, one place
const NUMW = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
export const deskYearWords = d => { const k = Math.abs(Math.round(d)); return k === 0 ? "Same year" : `${(NUMW[k] || String(k)).replace(/^./, c => c.toUpperCase())} ${k === 1 ? "year" : "years"} ${d > 0 ? "newer" : "older"}`; };
export const deskMilesWords = d => { const k = Math.round(Math.abs(d) / 100) * 100; return k < 1000 ? "about the same miles" : `${n(k)} ${d < 0 ? "fewer" : "more"} miles`; };
export const deskTierWords = d => { const k = Math.abs(Math.round(d)); return `${(NUMW[k] || String(k))} condition ${k === 1 ? "tier" : "tiers"} ${d < 0 ? "better" : "worse"}`; };
export const deskDateWords = iso => { const d = new Date(String(iso) + "T00:00:00Z"); return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }); };
export const deskRoundDiff = x => Math.round(Math.abs(Number(x)) / 500) * 500;
// "9 on Bring a Trailer, 3 on Cars & Bids and 2 on PCarMarket" (Nov 8 2026, the Sell entry example): the venues of one car's record with their sale counts, in the order given
export function venueSplitWords(list) {
  const parts = (list || []).map(v => `${Number(v.sales).toLocaleString("en-US")} on ${v.name}`);
  return parts.length < 2 ? parts.join("") : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}
export function reasonLine(id, p = {}) { const e = REASON_TABLE[id]; if (!e) throw new Error("reason line not in the table: " + id); return e.text(p); }
export const THIN_REASON_ID = { few_sales: "thin.few_sales", mixed_prices: "thin.mixed_prices", pooled_apart: "thin.pooled_apart", few_comparable: "thin.few_comparable" };
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
