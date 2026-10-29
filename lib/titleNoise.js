// TITLE FRAGMENTS ARE NOT MODELS (Lane B, Oct 29 2026). A listing title often opens with words about the sale, not the car: "23-Years-Owned, 350-Powered Custom 1941 Chevrolet Coupe",
// "Single-Family-Owned 1970 Cadillac Eldorado". The archive's own model column holds "Years" and "Single" for some of those rows, and the resolver's archive fallback took the
// word as the car, so a live card read the pool "Chevrolet Years" and an invariant refused it. Three rules, one place:
//   1. ownership and engine claims (N-Years-Owned, Single-Owner, Single-Family-Owned, 350-Powered) are stripped before the words are read;
//   2. a word that is only ever such a fragment (Years, Owned, Owner, Single, Powered) is never a model, whatever a column says;
//   3. a model is read from the words AFTER the make (a title is "[sale words] YEAR MAKE MODEL ..."), so a word in front of the year ("Custom", "Supercharged") is never a candidate.
// "Custom" after the make is a real name (the 1949 to 1951 Ford Custom) and stays a model there; "Ti" after the make is read as a trim by the resolver and is not touched here.
const OWNER_RES = [
  /\b\d+\s*[- ]\s*years?\s*[- ]\s*(?:family[- ])?owned\b,?/gi,
  /\b(?:single|one|two|three|original|first)\s*[- ]\s*(?:family\s*[- ]\s*)?owners?\b,?/gi,
  /\b(?:single|one|two)\s*[- ]\s*family\s*[- ]\s*owned\b,?/gi,
  /\b[0-9][0-9a-z.]*\s*[- ]\s*powered\b,?/gi,
  /\b\d\s*-\s*window\b/gi   // "5-Window Coupe" is a body, not a model
];
export const JUNK_MODEL_WORDS = ["years", "year", "owned", "owner", "owners", "single", "powered", "family", "original", "window"];
const JUNK = new Set(JUNK_MODEL_WORDS);
export const isJunkModel = m => JUNK.has(String(m == null ? "" : m).trim().toLowerCase().replace(/[^a-z]/g, ""));
export function stripTitleNoise(text) {
  let t = String(text == null ? "" : text);
  for (const re of OWNER_RES) t = t.replace(re, " ");
  return t.replace(/\s{2,}/g, " ").replace(/^[\s,;-]+/, "").trim();
}
// the words of a title that come after the make ("... 1941 Chevrolet Coupe" -> "Coupe"); the whole text when the make is not written in it (an alias, a typed model alone)
export function wordsAfterMake(text, make) {
  const t = String(text == null ? "" : text), mk = String(make || "").trim();
  if (!mk) return t;
  const re = new RegExp("(?:^|[^a-z0-9])" + mk.split(/[\s-]+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s-]*") + "(?![a-z0-9])", "i");
  const m = re.exec(t);
  return m ? t.slice(m.index + m[0].length).trim() : t;
}

// sale words a seller puts in FRONT of the year ("Custom 1937 Ford Pickup", "Supercharged 1990 Chevrolet 454 SS"); none of them is the car
export const PREFIX_FRAGMENT_WORDS = ["custom", "modified", "restored", "supercharged", "turbocharged", "euro", "project", "rebuilt", "original", "restomod", "built"];
// A model that is read ONLY from the words in front of the year, while the make comes after the year, is a sale word and not the car. Returns the text without those
// leading words ("350-Powered Custom 1941 Chevrolet Coupe" -> "1941 Chevrolet Coupe"), or null when the model is read from the car's own words (or the text is not title-shaped).
export function dropFragmentPrefix(text, make, model) {
  const t = String(text == null ? "" : text), mk = String(make || "").trim(), md = String(model || "").trim();
  if (!mk || !md) return null;
  const ym = /\b(?:18|19|20)\d\d\b/.exec(t); if (!ym || ym.index === 0) return null;
  const prefix = t.slice(0, ym.index), rest = t.slice(ym.index);
  const word = w => new RegExp("(?:^|[^a-z0-9])" + String(w).split(/[\s-]+/).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s-]*") + "(?![a-z0-9])", "i");
  if (word(mk).test(prefix) || !word(mk).test(rest)) return null;   // the make is in front of the year, or nowhere: not a sale-word prefix
  if (!word(md).test(prefix) || word(md).test(rest)) return null;   // the model is read from the car's own words
  const words = prefix.trim().split(/\s+/).filter(Boolean);
  const isFragment = words.length >= 2 || PREFIX_FRAGMENT_WORDS.includes(md.toLowerCase()) || isJunkModel(md);
  return isFragment ? rest.trim() : null;
}
