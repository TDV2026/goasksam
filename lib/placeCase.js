// Place names, written the way a person writes them (Sam, Oct 23 2026: "King Of Prussia" is "King of Prussia"). ONE function for every product
// that shows a listing's location (Find's cards, Tasks, the task emails): a place that arrives SHOUTING ("KING OF PRUSSIA, PA") is put in
// title case, and in every place (shouting or not) the small words inside a name stay lower case ("King of Prussia", "Isle of Wight",
// "Rancho Santa Margarita" and "Las Vegas" are untouched), except as the first word. State and country codes of two letters keep
// their capitals. Pure text, nothing looked up.
const SMALL = new Set(["of", "the", "de", "du", "des", "di", "da", "van", "von", "der", "den", "and", "on", "upon", "in", "at", "by", "sur", "sous", "en"]);
const cap = w => w.toLowerCase().split("-").map(x => x.charAt(0).toUpperCase() + x.slice(1)).join("-");
const part = p => {
  const t = p.trim(); if (!t) return "";
  const shouting = t === t.toUpperCase() && /[A-Z]{3}/.test(t);
  let seen = 0;
  return t.split(/(\s+)/).map(tok => {
    if (/^\s+$/.test(tok) || !tok) return tok;
    const first = seen++ === 0;
    if (!first && SMALL.has(tok.toLowerCase())) return tok.toLowerCase();
    return shouting ? cap(tok) : tok;
  }).join("");
};
export const placeCase = s => String(s == null ? "" : s).split(",").map(part).filter(Boolean).join(", ");
