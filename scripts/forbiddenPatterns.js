// Forbidden-patterns registry (locked). Every copy rule ever made lands here
// as one line and the smoke harness applies the whole registry to EVERY
// rendered surface (cards, narration, chat) across the standard battery.
// Add a line per future copy fix instead of a bespoke assertion.

export const FORBIDDEN_PATTERNS = [
  // Counts under 10 never render next to evidence nouns ("3 sales",
  // "4 close comparable sales"). Multi-digit counts pass (\b blocks "13").
  { name: "comp count under 10", re: /(?<![\w-])\d\s+(close\s+)?(comparable\s+)?(sales?|matches|close match(es)?|comps?)\b/i },
  { name: "only-N framing", re: /\bonly \d\b/i },
  // Lack-first framing: never open with what we don't have.
  { name: "lack-first framing", re: /\bnot enough\b|\bfor a real answer\b|\bfound none\b|we don'?t have (the |enough |much |any )?(data|sales|comps|records|numbers)/i },
  // Hedging and escape hatches after a recommendation.
  { name: "hedge or escape hatch", re: /pan out|we can (always )?revisit|feel free to|come back (to this|if|later)|if you change your mind|circumstances change|second opinion|if (this|that|it) (doesn'?t|does not) work( out)?/i },
  // Accusatory price doubt.
  { name: "price accusation", re: /double-check what you meant|are you sure about (your|that) price/i },
  // Typography.
  { name: "em or en dash", re: /—|–/ },
  // Announced honesty and defensive framing.
  { name: "defensive framing", re: /want to be straight|need to be honest|rather not do that to you|working against the data|i apologi[sz]e/i },
  // Vague card prose (claims must be specific and structured).
  { name: "vague card prose", re: /(^|[^\w])this is where i.d sell|consistently favoured this platform|every comparable sale we tracked|strongest run recently|buyer base:/i },
  // Price-gap paragraphs (deleted entirely): the seller's ask is never
  // compared to an average.
  { name: "price-gap paragraph", re: /one thing worth knowing: your asking price|your asking price is \d+% (above|below)|% (above|below) the average for recent/i },
  // Median price display on platform cards (variant spread makes it false
  // precision). Partner career medians use their own distinct label.
  { name: "platform median display", re: /median (sale )?\$[\d,]+|\$[\d,]+ here vs|median (sale )?here has run/i },
  // Consolation framing around speed picks.
  { name: "consolation framing", re: /close enough that speed and process may matter|may take longer to get live|timing is the tradeoff|where i.d (start|begin) if you (are )?sell(ing)? it yourself/i },
  // Sample-count parentheticals.
  { name: "sample-count parenthetical", re: /\(\d+\s+(listings|sales|recent)/i },
  // Invented services.
  { name: "consignment-flagging offer", re: /flag (your|the) (details|car|info)|forward your details|add you to (a|the) consignment/i },
  // False fee denials (fees DO exist).
  { name: "referral fee denial", re: /not (run|driven|funded) on referral fees|(don'?t|do not|doesn'?t|never) (receive|take|get|collect) (a )?referral fee|no referral fees/i },
  // Post-recommendation hedges (rule 15: recommendations are final).
  { name: "recommendation hedge", re: /i.d still compare|before choosing|points this way/i },
  // Count clauses on cards ("14 Carrera S sales in this window").
  { name: "count clause on card", re: /\d[\d,]*[^.\n]{0,60}sales in this window/i },
  // Valuation phrasing (locked: GoAskSam routes sellers, never values cars).
  { name: "valuation phrasing", re: /market value|typical price|comparable market|\bwhat (it|the car|your car).s worth\b|\b(car|it) is worth\b|your car is worth/i },
  // Valuation escape hatches in chat (locked): no capability-framing, no
  // outside endorsements, no dealer punts, no wishing.
  { name: "valuation escape hatch", re: /i don.t have that data|consult a dealer|valuation tools?|i wish i could/i }
];

export function findForbidden(text) {
  const haystack = String(text || "");
  return FORBIDDEN_PATTERNS
    .filter(pattern => pattern.re.test(haystack))
    .map(pattern => `${pattern.name}: "${(haystack.match(pattern.re) || [""])[0].slice(0, 80)}"`);
}
