// EXCLUSIONS: A WORD THE READER TYPED AFTER "NOT" REMOVES CARS, IT NEVER NARROWS TOWARD THEM (Lane B, Nov 1 2026; a reader's /feedback: "ND Miatas that are NOT RF" returned an RF).
// CAUSE: nothing read a negation. The resolver took "not GT" as trim GT, "not Turbo" as trim Turbo, "except convertible" as body convertible, "excluding Targa" as trim Targa, "no automatic" as an automatic filter, "not a V8" as a V8
// filter; the word NOT was dropped as filler (Find kept one negation form, for colours only). THE RULE: a negation word (not, no, non, non-, without, w/o, except, excluding, other than, anything but, but not, isn't, aren't, minus, and a
// hyphen straight before a word: "-RF") followed by an attribute word marks that attribute EXCLUDED. The phrase is taken out of the text before any reader sees it (so it can never narrow toward the word), and the exclusion rides as its own
// key ("not:rf") through the same path as the typed gearbox and engine words: the engine removes the sales that carry the word and says what it removed; Find removes the listings. A word we cannot test in a sale is said so, never ignored.
// "no reserve", "no more than 50k miles", "not over $80k" are not attribute exclusions and are left alone.
const sq = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const COLOURS = ["white", "black", "silver", "grey", "gray", "red", "blue", "green", "yellow", "orange", "brown", "beige", "gold", "purple", "burgundy", "maroon", "bronze", "tan", "cream", "pink", "turquoise"];
// id: the key tail; label: how it is printed; words: how a reader types it; rows: how a sale states it (title, trim, transmission field, colour field; description only where `desc`); kind: the noun in the answer
// partial: sales rarely say it, so an exclusion removes only the sales that do (the answer says so)
const ATTRS = [
  { id: "rf", kind: "trim", label: "RF", words: /^(?:rf|retractable(?:[- ]?(?:hard[- ]?top|fastback|top))?)$/i, rows: /\brf\b|\bretractable(?:\s+(?:hard\s*top|fastback|top))?\b/i },
  { id: "gt", kind: "trim", label: "GT", words: /^gt$/i, rows: /\bgt\b/i },
  { id: "sport", kind: "trim", label: "Sport", words: /^sport$/i, rows: /\bsport\b/i },
  { id: "turbo", kind: "engine", label: "turbo", words: /^turbo(?:charged)?$/i, rows: /\bturbo(?:charged|charger)?\b|\btwin[- ]?turbo\b/i },
  { id: "supercharged", kind: "engine", label: "supercharged", words: /^(?:supercharged|supercharger|blower)$/i, rows: /\bsupercharg(?:ed|er)\b|\bblower\b/i },
  { id: "v8", kind: "engine", label: "V8", words: /^v-?8$/i, rows: /\bv[- ]?8\b/i },
  { id: "v6", kind: "engine", label: "V6", words: /^v-?6$/i, rows: /\bv[- ]?6\b/i },
  { id: "v10", kind: "engine", label: "V10", words: /^v-?10$/i, rows: /\bv[- ]?10\b/i },
  { id: "v12", kind: "engine", label: "V12", words: /^v-?12$/i, rows: /\bv[- ]?12\b/i },
  { id: "flat6", kind: "engine", label: "flat-six", words: /^(?:flat-?six|flat-?6|boxer)$/i, rows: /\bflat[- ]?(?:six|6)\b|\bboxer\b/i },
  { id: "inline6", kind: "engine", label: "straight-six", words: /^(?:straight-?six|inline-?six|inline-?6|straight-?6|i6)$/i, rows: /\b(?:straight|inline|in-line)[- ]?(?:six|6)\b|\bi6\b/i },
  { id: "four", kind: "engine", label: "four-cylinder", words: /^(?:four-?cylinder|4-?cyl(?:inder)?|i4)$/i, rows: /\b(?:four|4)[- ]?cyl(?:inder)?s?\b|\bi4\b/i },
  { id: "targa", kind: "body", label: "Targa", words: /^targa$/i, rows: /\btarga\b/i },
  { id: "convertible", kind: "body", label: "convertible", words: /^(?:convertibles?|cabriolets?|cabrios?|drop-?heads?|drophead|volante|soft-?tops?)$/i, rows: /\b(?:convertible|cabriolet|cabrio|drop-?head(?:\s+coupe)?|volante|soft[- ]?top)\b/i },
  { id: "roadster", kind: "body", label: "roadster", words: /^roadsters?$/i, rows: /\broadster\b/i },
  { id: "spyder", kind: "body", label: "Spyder", words: /^(?:spyders?|spiders?)$/i, rows: /\bspy?der\b|\bspider\b/i },
  { id: "coupe", kind: "body", label: "coupe", words: /^coup(?:e|é)s?$/i, rows: /\bcoup(?:e|é)\b/i },
  { id: "sedan", kind: "body", label: "sedan", words: /^(?:sedans?|saloons?)$/i, rows: /\b(?:sedan|saloon)\b/i },
  { id: "wagon", kind: "body", label: "wagon", words: /^(?:wagons?|estates?|avant|touring)$/i, rows: /\b(?:wagon|estate|avant|shooting brake)\b/i },
  { id: "hatchback", kind: "body", label: "hatchback", words: /^hatch(?:back)?s?$/i, rows: /\bhatch(?:back)?\b/i },
  { id: "fastback", kind: "body", label: "fastback", words: /^fastbacks?$/i, rows: /\bfastback\b/i },
  { id: "suv", kind: "body", label: "SUV", words: /^suvs?$/i, rows: /\bsuv\b/i },
  { id: "pickup", kind: "body", label: "pickup", words: /^(?:pickups?|trucks?)$/i, rows: /\b(?:pickup|pick-up|truck)\b/i },
  { id: "manual", kind: "gearbox", label: "manual", words: /^(?:manuals?|stick|stick-?shift|[3-7]-?speed manual)$/i, tx: "manual" },
  { id: "automatic", kind: "gearbox", label: "automatic", words: /^(?:automatics?|auto|autos|tiptronic|pdk|dct|dsg|smg|cvt|steptronic)$/i, tx: "auto" },
  { id: "awd", kind: "drive", label: "all-wheel drive", words: /^(?:awd|4wd|4x4|all-?wheel|four-?wheel|quattro)$/i, rows: /\b(?:awd|4wd|4x4|all[- ]wheel|four[- ]wheel|quattro|4matic|xdrive)\b/i, partial: true },
  { id: "rwd", kind: "drive", label: "rear-wheel drive", words: /^(?:rwd|rear-?wheel)$/i, rows: /\b(?:rwd|rear[- ]wheel)\b/i, partial: true },
  { id: "sunroof", kind: "equipment", label: "a sunroof", words: /^(?:sun-?roof|moon-?roof|sunroofs?)$/i, rows: /\b(?:sun|moon)[- ]?roof\b/i, desc: true, partial: true },
  { id: "aircon", kind: "equipment", label: "air conditioning", words: /^(?:a\/c|ac|air-?con(?:ditioning)?)$/i, rows: /\b(?:a\/c|air[- ]?con(?:ditioning)?)\b/i, desc: true, partial: true },
  ...COLOURS.map(c => ({ id: "c_" + c, kind: "colour", label: c, words: new RegExp("^" + c + "$", "i"), rows: new RegExp("\\b" + c + "\\b", "i"), colour: true }))
];
const BY_ID = new Map(ATTRS.map(a => [a.id, a]));
// words that follow a negation but are not an attribute to exclude
const NOT_AN_ATTRIBUTE = new Set(["reserve", "reserves", "more", "less", "than", "over", "under", "above", "below", "mileage", "miles", "mile", "mi", "km", "price", "limit", "budget", "money", "later", "earlier", "after", "before", "older", "newer", "year", "years", "older", "only", "just", "sure", "problem", "problems", "idea", "matter", "worries", "longer", "worry", "need", "i", "to", "me", "thanks", "since", "within", "between", "from", "exceeding", "cheaper", "dearer", "expensive"]);
const SKIP = new Set(["a", "an", "the", "any", "one", "with", "of", "that", "is", "are", "was", "be", "it", "its", "has", "have", "had", "having", "getting", "wanting", "want", "being"]);
const JOIN = new Set(["or", "nor", "and", "&", "/", ","]);
const NEG_RE = /(?:^|[\s(,;])(?:(?:that|which|who)\s+)?(?:(?:is|are)\s+not|(?:is|are)\s+not|isn'?t|aren'?t|is\s*n't|are\s*n't|not|no|non|without|w\/o|except(?:ing)?|exclud(?:e|es|ing)|other\s+than|anything\s+but|but\s+not|apart\s+from|besides|minus|sans|never)(?=[\s-]|$)[\s-]*/ig;
const tokenWord = w => String(w || "").replace(/^[("'“]+|[)"'”.,;:!?]+$/g, "");
function attrOf(word) { const w = tokenWord(word); if (!w) return null; return ATTRS.find(a => a.words.test(w)) || null; }
// "RF" in "-RF" and a hyphen straight before a word: " -RF", "Miata -RF"
const MINUS_RE = /(?:^|\s)-(?=[a-z0-9])/ig;
const genericId = w => "w_" + sq(w).slice(0, 24);
function genericAttr(word) {
  const w = tokenWord(word);
  const code = /^\d{3}(\.\d)?$/.test(w);
  if (!w || w.length < 2 || NOT_AN_ATTRIBUTE.has(w.toLowerCase()) || SKIP.has(w.toLowerCase()) || JOIN.has(w.toLowerCase()) || (!code && (/^[\d$£€.,]+k?m?$/i.test(w) || /^\d/.test(w)))) return null;
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { id: genericId(w), kind: /^(?:[a-z]\d{2}|\d{3}(?:\.\d)?|w\d{3})$/i.test(w) ? "generation" : "title word", label: w.length <= 3 || /\d/.test(w) ? w.toUpperCase() : w.replace(/^./, c => c.toUpperCase()), words: null, rows: new RegExp("\\b" + esc + "\\b", "i"), generic: true, partial: true, word: w };
}
// text -> { clean, items: [{ key, id, kind, label, partial }] }; clean has the negation phrases taken out
export function exclusionsIn(text) {
  const src = String(text || ""); if (!/(?:\bnot\b|\bno\b|\bnon\b|\bwithout\b|\bw\/o\b|\bexcept|\bexclud|other\s+than|\bbut\b|\bapart\b|\bbesides\b|\bminus\b|\bsans\b|\bnever\b|n't\b|(?:^|\s)-[a-z0-9])/i.test(src)) return { clean: src, items: [] };
  let work = " " + src.replace(/[–—]/g, "-").replace(/\s+/g, " ") + " ";
  const items = [];
  const take = (m0, start, wordsText) => {
    // wordsText: the text after the negation; read words (and "or/and/," joins) while they are attributes; the first one may be any word
    const toks = wordsText.split(/(\s+|,|(?<![aA])\/)/).filter(t => t !== undefined && t !== "");
    let used = 0, got = 0, first = true, buf = "", afterJoin = false;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i]; if (/^\s+$/.test(t)) { buf += t; continue; }
      const lw = tokenWord(t).toLowerCase();
      if (JOIN.has(lw) || t === "," || t === "/") { if (got) { buf += t; afterJoin = true; continue; } break; }
      if (SKIP.has(lw) && !first || (SKIP.has(lw) && first && got === 0 && i < toks.length - 1)) { buf += t; continue; }
      let a = attrOf(t);
      // "w/ out", two-word forms: "soft top", "air con", "all wheel drive", "straight six", "flat six"
      if (!a) { const two = tokenWord(t) + " " + tokenWord((toks[i + 2] || "")); const a2 = attrOf(two.replace(/\s+/g, "-")); if (a2 && toks[i + 2]) { a = a2; i += 2; buf += t + " " + toks[i]; used = buf.length; if (!items.some(x => x.id === a.id)) items.push({ key: "not:" + a.id, id: a.id, kind: a.kind, label: a.label, partial: !!a.partial }); got++; first = false; continue; } }
      if (!a && (first || (afterJoin && /^\d{3}(\.\d)?$|^[a-z]\d{2}$/i.test(tokenWord(t))))) a = genericAttr(t);
      if (!a) break;
      buf += t; used = buf.length; first = false; got++; afterJoin = false;
      if (!items.some(x => x.id === a.id)) items.push({ key: "not:" + a.id, id: a.id, kind: a.kind, label: a.label, partial: !!a.partial });
    }
    return got ? used : 0;
  };
  // 1. negation words
  let out = "", last = 0, m; NEG_RE.lastIndex = 0;
  const positions = [];
  while ((m = NEG_RE.exec(work))) positions.push({ at: m.index, end: m.index + m[0].length, lead: m[0].match(/^[\s(,;]/) ? 1 : 0 });
  for (const p of positions) {
    if (p.at < last) continue;
    const rest = work.slice(p.end), used = take("", p.at, rest.replace(/^\s+/, ""));
    if (!used) continue;
    const skipWs = rest.length - rest.replace(/^\s+/, "").length;
    out += work.slice(last, p.at + p.lead) + " "; last = p.end + skipWs + used;
  }
  out += work.slice(last); work = out;
  // 2. a hyphen straight before a word: "Miata -RF"
  MINUS_RE.lastIndex = 0; let w2 = "", l2 = 0;
  while ((m = MINUS_RE.exec(work))) {
    const after = work.slice(m.index + m[0].length), tok = /^[A-Za-z0-9\/]+/.exec(after); if (!tok) continue;
    const a = attrOf(tok[0]) || (/^[A-Za-z]{2,}$/.test(tok[0]) && !/^\d/.test(tok[0]) ? genericAttr(tok[0]) : null); if (!a) continue;
    if (!items.some(x => x.id === a.id)) items.push({ key: "not:" + a.id, id: a.id, kind: a.kind, label: a.label, partial: !!a.partial });
    w2 += work.slice(l2, m.index) + " "; l2 = m.index + m[0].length + tok[0].length;
  }
  work = w2 + work.slice(l2);
  if (!items.length) return { clean: src, items: [] };
  return { clean: work.replace(/\s+/g, " ").replace(/\s+([,.])/g, "$1").trim(), items };
}
// a stored key back to its entry; a generic title word keeps its word in the key ("not:w_spyder")
export function exclusionByKey(key) {
  const k = String(key || ""); if (!k.startsWith("not:")) return null;
  const id = k.slice(4), a = BY_ID.get(id);
  if (a) return { key: k, id, kind: a.kind, label: a.label, rows: a.rows || null, tx: a.tx || null, desc: !!a.desc, partial: !!a.partial, colour: !!a.colour, exclude: true };
  if (/^w_[a-z0-9]{2,24}$/.test(id)) { const w = id.slice(2); return { key: k, id, kind: /^(?:[a-z]\d{2}|\d{3}\d?|w\d{3})$/.test(w) ? "generation" : "title word", label: w.length <= 3 || /\d/.test(w) ? w.toUpperCase() : w.replace(/^./, c => c.toUpperCase()), rows: new RegExp("\\b" + w + "\\b", "i"), tx: null, desc: false, partial: true, colour: false, exclude: true }; }
  return null;
}
export const isExclusionKey = k => /^not:/.test(String(k || ""));
const fieldsOf = (r, ex) => [r && r.rtitle, r && r.raw_title, r && r.listing_title, r && r.title, r && r.trim, ex.colour ? (r && (r.exterior_color || r.color || (r.raw_record && r.raw_record.exterior_color))) : null, ex.desc ? (r && r.description) : null, ex.kind === "gearbox" ? (r && r.transmission) : null].filter(Boolean).join(" ");
// does this sale (or listing) carry the excluded word? gearbox exclusions are decided by the caller's own gearbox reader (gearboxOf(row) -> "manual" | "auto" | null)
export function rowExcluded(ex, row, gearboxOf) {
  if (!ex) return false;
  if (ex.tx) { const g = gearboxOf ? gearboxOf(row) : null; return g === ex.tx; }
  return !!(ex.rows && ex.rows.test(fieldsOf(row, ex)));
}
