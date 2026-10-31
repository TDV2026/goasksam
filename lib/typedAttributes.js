// TYPED ATTRIBUTES: A GEARBOX, ENGINE OR BODY WORD THE READER TYPED IS APPLIED OR ANNOUNCED, NEVER DROPPED (Lane B, Oct 30 2026; two readers on launch day).
// "2005-6 Pontiac GTO 6-speed" returned manual and automatic together; "W123 Mercedes with a V8" returned a four-cylinder 230TE; "1932 Ford V-8 Roadster" pooled a Phaeton. The typed word was read by nothing,
// so the answer silently widened. THE RULE: a typed gearbox word (N-speed), engine word (V8, V-8, V6, V10, V12, flat-six, straight-six, inline-6, four-cylinder, turbo, supercharged, LS-swap, restomod)
// becomes an applied filter when the pool's sales carry that attribute in their own words (title, transmission field, description), printed as a chip the reader can remove, exactly like typed mileage;
// when no sale carries it, the answer says so plainly ("Sales do not say their engine, so Sam could not filter by V8.") and keeps the pool. A word that is part of the car's own name
// (a Turbo trim, a V8 Vantage, the Ford V-8) is the car, not an attribute. The plain gearbox words (manual, stick, automatic, PDK, Tiptronic, DCT, SMG, three pedals) are read by the engine's gearbox refine
// (lib/onebox.js, refine.tx); the typed body words by the body refine (refine.body); this module covers the rest, one table for the typed word and the same table for the sales that carry it.
const NUM_WORDS = { three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
const sq = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// kind: what the sales are asked about (the noun in the announcement); typed: how the reader writes it; rows: how a sale states it; own: a word of the car's name that means the same (never an attribute)
const TABLE = [
  { key: "v8", kind: "engine", label: "V8", typed: /\bv[- ]?8\b/i, rows: /\bv[- ]?8\b/i, own: "v8" },
  { key: "v6", kind: "engine", label: "V6", typed: /\bv[- ]?6\b/i, rows: /\bv[- ]?6\b/i, own: "v6" },
  { key: "v10", kind: "engine", label: "V10", typed: /\bv[- ]?10\b/i, rows: /\bv[- ]?10\b/i, own: "v10" },
  { key: "v12", kind: "engine", label: "V12", typed: /\bv[- ]?12\b/i, rows: /\bv[- ]?12\b/i, own: "v12" },
  { key: "flat6", kind: "engine", label: "flat-six", typed: /\bflat[- ]?(?:six|6)\b|\bboxer[- ]?(?:six|6)\b/i, rows: /\bflat[- ]?(?:six|6)\b|\bboxer[- ]?(?:six|6)\b/i, own: "flat6" },
  { key: "inline6", kind: "engine", label: "straight-six", typed: /\b(?:straight|inline|in-line)[- ]?(?:six|6)\b|\bi6\b/i, rows: /\b(?:straight|inline|in-line)[- ]?(?:six|6)\b|\bi6\b/i, own: "inline6" },
  { key: "four", kind: "engine", label: "four-cylinder", typed: /\b(?:four|4)[- ]?cyl(?:inder)?s?\b|\b(?:inline|straight)[- ]?(?:four|4)\b|\bi4\b/i, rows: /\b(?:four|4)[- ]?cyl(?:inder)?s?\b|\b(?:inline|straight)[- ]?(?:four|4)\b|\bi4\b/i, own: "four" },
  { key: "turbo", kind: "engine", label: "turbo", typed: /\bturbo(?:charged|charger)?\b/i, rows: /\bturbo(?:charged|charger)?\b|\btwin[- ]?turbo\b/i, own: "turbo" },
  { key: "supercharged", kind: "engine", label: "supercharged", typed: /\bsupercharged\b|\bsupercharger\b|\bblower\b/i, rows: /\bsupercharg(?:ed|er)\b|\bblower\b/i, own: "supercharged" },
  // swapped and restomod cars are set aside from every read (lib/onebox.js MODIFIED_TITLE_RE); the typed word is announced, never applied
  { key: "lsswap", kind: "engine", label: "LS-swap", typed: /\bls[0-9]?[- ]?(?:swap|swapped|powered)\b/i, rows: /\bls[0-9]?[- ]?(?:swap|swapped|powered)\b/i, own: "lsswap", setAside: true },
  { key: "restomod", kind: "engine", label: "restomod", typed: /\brestomod(?:ded)?\b|\bresto[- ]mod\b/i, rows: /\brestomod(?:ded)?\b|\bresto[- ]mod\b/i, own: "restomod", setAside: true }
];
// N-speed (3 to 8), typed as a digit or a word: one entry per number found
const SPEED_TYPED = /\b(?:([3-8])|(three|four|five|six|seven|eight))[- ]?(?:speed|spd)\b/ig;
const speedEntry = n => ({ key: `speed${n}`, kind: "gearbox", label: `${n}-speed`, rows: new RegExp(`\\b${n}[- ]?(?:speed|spd)\\b|\\b${Object.keys(NUM_WORDS).find(w => NUM_WORDS[w] === n)}[- ]?speed\\b`, "i"), own: `speed${n}` });
// the words of the car's own name, squashed ("V8 Vantage" -> v8vantage)
function ownText(v) { return sq([v && v.make, v && v.model, v && v.parentModel, v && v.trim, v && v.edition, v && v.variant, v && v.nameModel].filter(Boolean).join(" ")); }
function ownHas(entry, v) {
  const o = ownText(v);
  if (!o) return false;
  if (entry.kind === "gearbox") return false;
  const probe = { v8: "v8", v6: "v6", v10: "v10", v12: "v12", flat6: "flat6", inline6: "inline6", four: "four", turbo: "turbo", supercharged: "supercharged", lsswap: "lsswap", restomod: "restomod" }[entry.key];
  return !!probe && o.includes(probe);
}
// the Ford V-8 is the car's name from 1932 to 1953, and a "V-8" typed beside Ford in those years names it, not an engine to look for
const nameIsTheEngine = (entry, v) => entry.key === "v8" && v && /^ford$/i.test(String(v.make || "")) && Number(v.year) >= 1932 && Number(v.year) <= 1953;
// text: the typed search; vehicle: what the resolver made of it. Returns the attributes to apply or announce, each { key, kind, label, rows (RegExp), setAside }.
export function typedAttributesIn(text, vehicle, off) {
  const t = String(text || ""), out = [], skip = new Set((Array.isArray(off) ? off : []).map(String));
  const add = e => { if (!skip.has(e.key) && !out.some(x => x.key === e.key)) out.push({ key: e.key, kind: e.kind, label: e.label, rows: e.rows, setAside: !!e.setAside }); };
  for (const e of TABLE) if (e.typed.test(t) && !ownHas(e, vehicle) && !nameIsTheEngine(e, vehicle)) add(e);
  SPEED_TYPED.lastIndex = 0; let m;
  while ((m = SPEED_TYPED.exec(t))) { const n = m[1] ? Number(m[1]) : NUM_WORDS[m[2].toLowerCase()]; if (n) add(speedEntry(n)); }
  return out;
}
const rowText = r => [r && r.rtitle, r && r.raw_title, r && r.listing_title, r && r.transmission, r && r.description].filter(Boolean).join(" ");
export const rowCarries = (attr, row) => !!(attr && attr.rows && attr.rows.test(rowText(row)));
// the noun in the announcement
export const ATTR_NOUN = { gearbox: "gearbox", engine: "engine" };
// a stored key back to its entry (a refine carries keys, never regular expressions)
export function typedAttributeByKey(key) {
  const k = String(key || ""), e = TABLE.find(x => x.key === k);
  if (e) return { key: e.key, kind: e.kind, label: e.label, rows: e.rows, setAside: !!e.setAside };
  const m = /^speed([3-8])$/.exec(k); if (m) { const s = speedEntry(Number(m[1])); return { key: s.key, kind: s.kind, label: s.label, rows: s.rows, setAside: false }; }
  return null;
}
