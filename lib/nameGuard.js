// NON-CAR NAMES NEVER REACH A CAR'S NAME (Lane B, Nov 4 2026, job lane-b-names, from Rick Carey's launch-day list: "Chrysler By", "Delahaye By", "Dodge Hemi R T", "Ferrari F1", "Chevrolet LT1", "Jaguar Mark", "Packard Super",
// "Ferrari 275 GTB RN26", "Alfa Romeo GTA"). The resolver (lib/vehicle.js resolveVehicle) read the words of a title as model and trim words, so a coachbuilder phrase, a gearbox word, an engine word, a reference number or the front half of a
// two-word model became the name. Two stages, both pure, both wrapped around the resolver (nothing inside it moves):
//   1. nameFirst(text): BEFORE the read. A coachbuilder phrase ("by Chapron", "coachwork by Figoni et Falaschi") leaves the text and is kept as the coachbuilder; a lot or reference number ("Lot 45", "RN26", "Ref. No. 07823", "#CSX2000")
//      is dropped. Parser step per pattern: coachbuilder -> BY_PHRASE; lot and reference numbers -> REF_NUMBERS.
//   2. guardVehicle(vehicle, text): AFTER the read. An engine, gearbox or option word never stays as the model or a trim (ENGINE_AS_MODEL, TRIM_DROP); the front half of a two-word model is completed from the phrase table
//      (PHRASED_MODELS: Jaguar Mark VII, Packard Super Eight); a model that is only the badge of several cars (Alfa Romeo GTA) is completed from the year or left unnamed (BADGE_ONLY), so the page keeps the listing title and no answer is
//      stored under a bad key. badNameOf(vehicle) names the pattern a stored name still shows (used by the sweep SQL, the stored-row reader and the check).
import { COACHBUILDERS } from "./coachbuilders.js";
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const CB_LIST = COACHBUILDERS.map(n => ({ name: n, n: norm(n) })).sort((a, b) => b.n.length - a.n.length);
const cbOf = phrase => { const p = norm(phrase).replace(/^(the|coachbuilders?)\s+/, ""); const hit = CB_LIST.find(c => p === c.n || p.startsWith(c.n + " ")); return hit ? hit.name : null; };
const titleCase = s => String(s).trim().replace(/\s+/g, " ").replace(/\b([a-z])/g, m => m.toUpperCase());

// 1. BEFORE THE READ -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// a coachbuilder phrase: "by Chapron", "coachwork by Figoni et Falaschi", "bodied by Vignale"; a trailing "by" phrase of up to four words that no model reads
export const BY_PHRASE = /(?:[,;(-]\s*|\s+)(?:with\s+)?(?:(?:custom\s+)?coachwork\s+|(?:coach)?built\s+|bodied\s+|body\s+)?by\s+([A-Za-z][A-Za-z.'&-]*(?:\s+(?:et|and|&|of|de|di|van|den|von|[A-Za-z][A-Za-z.'&-]*)){0,3})\s*\)?\s*$/i;
// a lot or reference number: "Lot 45", "Lot #234", "Ref. No. 07823", "RN26", "S/N 1234", "#CSX2000"
export const REF_NUMBERS = [/\blot\s*#?\s*\d+[a-z]?\b[:,]?/gi, /\bref(?:erence)?\b\.?\s*(?:no\.?|number|#)?\s*[:#]?\s*[A-Z0-9-]*\d[A-Z0-9-]*\b/gi, /\b(?:RN|S\/N)\s?\d{1,6}\b/g, /(?<![A-Za-z0-9])#\s?[A-Za-z0-9-]*\d[A-Za-z0-9-]*/g, /\bno\.\s*\d{2,6}\b/gi];
export function nameFirst(input) {
  let text = String(input == null ? "" : input), coachbuilder = null, dropped = [];
  if (/^\s*[A-HJ-NPR-Z0-9]{17}\s*$/i.test(text)) return { text, coachbuilder, dropped };   // a VIN is not a title
  for (const re of REF_NUMBERS) { const next = text.replace(re, m => { dropped.push(m.trim()); return " "; }); text = next; }
  text = text.replace(/\s+/g, " ").trim();
  const m = BY_PHRASE.exec(text);
  if (m && /[A-Za-z]{3}/.test(text.slice(0, m.index))) {
    const known = cbOf(m[1]);
    // an unknown "by" phrase still leaves the text (a model never ends in "by Name"); it is kept as the coachbuilder only when the list knows the firm
    coachbuilder = known || null; dropped.push(m[0].trim());
    text = text.slice(0, m.index).replace(/[,;(\s-]+$/, "").trim();
  }
  return { text, coachbuilder, dropped };
}

// 2. AFTER THE READ --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// an engine, gearbox or option word as the whole model
export const ENGINE_AS_MODEL = new Set(["hemi", "v8", "v6", "v10", "v12", "diesel", "tdi", "turbo", "supercharged", "lt1", "lt4", "lt5", "ls1", "ls2", "ls3", "ls6", "ls7", "l88", "l89", "l98", "l72", "l79", "f1", "dct", "pdk", "manual", "automatic", "tiptronic", "smg", "cvt"]);
// A WORD THAT IS ALSO A REAL CAR'S NAME (the sweep of every model the guard could blank, Nov 4 2026): McLaren F1, Aston Martin V8, Ford V8 and F-1, Lagonda V12, Daimler V8, Cadillac V-8, the Jaguar and Lincoln V12. Per make, so "Ferrari F1" and "Chevrolet LT1" stay unnamed.
export const REAL_ENGINE_NAMES = { "mclaren": ["f1"], "aston martin": ["v8", "v12"], "ford": ["v8", "f1"], "lagonda": ["v12"], "daimler": ["v8"], "cadillac": ["v8"], "jaguar": ["v12"], "lincoln": ["v12"], "auburn": ["v12"] };
// as a TRIM only the Jaguar V12 is a tier of its own (E-Type, XJ, XJS); "Ford V8" in a trim ("Mustang GT V8") is the engine
export const REAL_ENGINE_TRIMS = { "jaguar": ["v12"] };
export const engineWordIsTrim = (make, word) => (REAL_ENGINE_TRIMS[norm(make)] || []).includes(norm(word).replace(/ /g, ""));
export const engineWordIsName = (make, word) => (REAL_ENGINE_NAMES[norm(make)] || []).includes(norm(word).replace(/ /g, ""));
// words dropped from a trim when anything else stays with them; Hemi, LT1 and L88 stay when they are the whole trim (the tier a sale names), V8 and a gearbox never stay
const TRIM_DROP_RE = /^(?:v[- ]?(?:6|8|10|12)|flat[- ]?(?:4|6|8|12)|inline[- ]?[46]|straight[- ]?[68]|diesel|tdi|manual|automatic|auto|stick|dct|pdk|smg|cvt|f1|\d[- ]?speed|\d[- ]?spd)$/i;
const TRIM_DROP_WITH_OTHERS_RE = /^(?:hemi)$/i;
const ALWAYS_DROP_RE = /^(?:v[- ]?(?:6|8|10|12)|diesel|tdi|manual|automatic|auto|stick|dct|pdk|smg|cvt|\d[- ]?speed|\d[- ]?spd)$/i;
// the front half of a two-word model, completed from the words that follow it in the text. [make, model as read, regex on the text -> full model]
const ROMAN = { i: "1", ii: "2", iii: "3", iv: "IV", v: "V", vi: "VI", vii: "VII", viii: "VIII", ix: "IX", x: "X" };
export const PHRASED_MODELS = [
  { make: "Jaguar", read: /^(mark|mk|mk\.|viii|ix|vii|vi|iv|v|x)$/i, find: /\b(?:mark|mk\.?)\s*(viii|vii|vi|iv|ix|x|v|iii|ii|i|[1-9]|10)(?![a-z0-9])/i, name: m => { const t = m[1].toLowerCase(), r = ROMAN[t]; return /^[1-3]$/.test(t) || /^(i|ii|iii)$/.test(t) ? "Mark " + (r || t) : "Mark " + (r || t.toUpperCase()); } },
  { make: "Alfa Romeo", maxYear: 1977, read: /^(gtv|1750|2000|berlina|spider)$/i, find: /\b(1750|2000)\s*(gtv|berlina|spider)\b/i, name: m => m[1] + " " + (m[2].length === 3 && /gtv/i.test(m[2]) ? "GTV" : titleCase(m[2])) },
  { make: "Packard", read: /^(eight|super|light|standard|custom|deluxe|twin)$/i, find: /\b(super|light|standard|custom|deluxe)\s+(eight|8)\b|\btwin\s+six\b|\bclipper\s+(?:eight|8|custom)\b/i, name: m => /twin/i.test(m[0]) ? "Twin Six" : /clipper/i.test(m[0]) ? "Clipper" : titleCase(m[1]) + " Eight" },
];
// a badge several cars wear, with the years it names one car: [make, badge, [[from, to, model, trim]]]; outside the years the badge is one of several cars and names none
export const BADGE_ONLY = [
  { make: "Alfa Romeo", badge: /^gta$/i, years: [[1965, 1972, "Giulia", "GTA"], [2020, 2023, "Giulia", "GTA"]] },
  { make: "Alfa Romeo", badge: /^gtam$/i, years: [[1969, 1972, "Giulia", "GTAm"], [2020, 2023, "Giulia", "GTAm"]] },
];
// A MODEL WHOSE FIRST WORD THE READ DROPPED (lane-b-names3, Nov 5 2026: "1949 Rolls-Royce Silver Wraith" read as "Wraith", the 2013 to 2021 car). CAUSES: a colour word is stripped from the text before the model is read (Silver, in front of Wraith and Ghost);
// a model the taxonomy files under its second word (Ferrari 166 MM -> MM, 288 GTO -> GTO, Lamborghini 400 GT -> GT, Maserati 5000 GT -> GT); a Roman numeral read alone (Jaguar Mark VIII -> VIII). The sweep walked every multi-word model of the generation table,
// the curated models, the aliases and Rick's list (294) and kept the real cars whose first word is lost: they are restored from the words of the text, whatever the year. Rolls-Royce Silver Dawn, Cloud, Shadow, Spirit, Spur and Seraph already keep Silver.
export const KEEP_FIRST_WORD = [
  ["Rolls-Royce", ["Silver Wraith", "Silver Ghost", "Silver Dawn", "Silver Cloud", "Silver Shadow", "Silver Spirit", "Silver Spur", "Silver Seraph"]],
  ["Ferrari", ["166 MM", "166 Inter", "195 Inter", "212 Export", "212 Inter", "340 America", "342 America", "410 Superamerica", "288 GTO"]],
  ["Lamborghini", ["350 GT", "400 GT"]], ["Maserati", ["5000 GT"]], ["Alfa Romeo", ["8C 2900"]], ["Bentley", ["R-Type Continental"]],
].flatMap(([make, names]) => names.map(name => ({ make, name, n: norm(name), re: new RegExp("(?<![A-Za-z0-9])" + name.split(/[\s-]+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s-]*") + "(?![A-Za-z0-9])", "i") })));
const wordsOf = s => String(s || "").split(/\s+/).filter(Boolean);
export function guardVehicle(v, text) {
  if (!v || typeof v !== "object") return v;
  let out = v, changed = false;
  const set = (k, val) => { if (out[k] !== val) { out = changed ? out : { ...out }; changed = true; out[k] = val; } };
  const T = String(text || ""), model = String(out.model || ""), mk = String(out.make || "");
  // (0) a model whose first word the read dropped is restored from the text (KEEP_FIRST_WORD); a model that is already longer than the name, or another name, stays
  for (const k of KEEP_FIRST_WORD) if (k.make.toLowerCase() === mk.toLowerCase() && k.re.test(T)) {
    const cur = norm(out.model).replace(/ /g, ""), full = k.n.replace(/ /g, "");
    if (cur !== full && (!cur || full.endsWith(cur) || full.includes(cur))) { set("model", k.name); const tr = norm(out.trim).replace(/ /g, ""); if (tr && full.includes(tr)) set("trim", null); }
    break;
  }
  // (a) the front half of a two-word model is completed from the text
  for (const p of PHRASED_MODELS) if (p.make.toLowerCase() === mk.toLowerCase() && p.read.test(model) && !(p.maxYear && Number(out.year) > p.maxYear)) { const m = p.find.exec(T); if (m) { set("model", p.name(m)); if (/^(super|light|standard|custom|deluxe|twin)$/i.test(String(out.trim || "")) && p.make === "Packard") set("trim", null); break; } }
  // (b) an engine or gearbox word as the whole model: the model is not named (the page keeps the listing's title); Plymouth's Hemi 'Cuda is the Barracuda 'Cuda
  if (ENGINE_AS_MODEL.has(norm(out.model)) && !engineWordIsName(mk, out.model)) {
    if (/^plymouth$/i.test(mk) && /\bhemi\s+'?cuda\b/i.test(T)) { set("model", "Barracuda"); set("trim", "Cuda"); } else { const t = out.trim; set("model", null); if (t) set("trim", t); }
  }
  // (c) a badge several cars wear
  for (const b of BADGE_ONLY) if (b.make.toLowerCase() === mk.toLowerCase() && b.badge.test(String(out.model || ""))) {
    const y = Number(out.year), hit = Number.isFinite(y) ? b.years.find(r => y >= r[0] && y <= r[1]) : null;
    if (hit) { set("model", hit[2]); set("trim", hit[3]); } else set("model", null);
  }
  // (d) engine, gearbox and option words in the trim
  if (out.trim) {
    const ws = wordsOf(out.trim);
    let kept = ws.filter(w => !ALWAYS_DROP_RE.test(w) || engineWordIsTrim(mk, w));
    if (kept.length > 1) kept = kept.filter(w => !TRIM_DROP_WITH_OTHERS_RE.test(w) && !/^f1$/i.test(w));
    else if (kept.length === 1 && /^f1$/i.test(kept[0])) kept = [];
    if (kept.length !== ws.length) set("trim", kept.length ? kept.join(" ") : null);
  }
  return out;
}
// the pattern a stored name still shows, or null: the sweep SQL, the stored-row reader and the check all ask this one function
export function badNameOf(v) {
  if (!v) return null;
  const model = String(v.model || ""), trim = String(v.trim || ""), mk = String(v.make || "");
  if (/^(by|the|and|of|with|for)$/i.test(model)) return "connective";
  if (ENGINE_AS_MODEL.has(norm(model)) && !engineWordIsName(mk, model)) return "engine_or_gearbox_as_model";
  if (PHRASED_MODELS.some(p => p.make.toLowerCase() === mk.toLowerCase() && p.read.test(model) && !/\s/.test(model.trim()) && /^(mark|mk|super|light|standard|custom|deluxe|twin)$/i.test(model))) return "partial_model";
  if (BADGE_ONLY.some(b => b.make.toLowerCase() === mk.toLowerCase() && b.badge.test(model))) return "badge_only_model";
  if (wordsOf(trim).some(w => ALWAYS_DROP_RE.test(w) && !engineWordIsTrim(mk, w))) return "engine_or_gearbox_in_trim";
  if (wordsOf(trim).length > 1 && wordsOf(trim).some(w => TRIM_DROP_WITH_OTHERS_RE.test(w) || /^f1$/i.test(w))) return "engine_or_gearbox_in_trim";
  if (REF_NUMBERS.some(re => { re.lastIndex = 0; return re.test(`${model} ${trim}`); })) return "reference_number";
  return null;
}
