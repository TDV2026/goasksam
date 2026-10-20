// Body-change sweep (Lane B, Oct 20 2026, Sam: "Sweep: yes, build bodychanges as proposed, read-only"). A typed 2016 C63 read
// through the calendar window 2014 to 2018 and pooled two bodies (W204 and W205) because lib/generations.js has no C63 entry.
// This finds the same class from the archive's OWN titles: per make and model, the chassis or generation codes the titles name,
// each code's year span and sale count, and every place two codes' spans sit close enough that a typed year's calendar window
// (year +/- 2) would pool both bodies. Pure functions; the ops task (task=bodychanges) feeds it sales_archive rows.
// LIMIT, stated on every output: it sees only codes the titles NAME; a model whose listings never name a code stays invisible,
// and a title naming two different codes is skipped (never guessed).
import { generationsForModel } from "./generations.js";

// code shapes per make (lowercase make): a short curated list; short tokens are case-sensitive so ordinary words never match.
// Model-name numbers are refused (a Mercedes C300 or a Porsche 944 is a model, not a body code).
const MB_NAME_NUMBERS = { C: /^(180|200|220|230|240|250|270|280|300|320|350|400|450)$/, R: /^(320|350|500)$/, A: /^(140|160|170|190|200|210|220|250)$/, S: /./ };
const PORSCHE_MODEL_NUMBERS = /^(911|912|914|918|924|928|944|959|968)$/;
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
const SHAPES = {
  "mercedes-benz": { re: /\b([WCRAS])(\d{3})\b/g, norm: m => (m[1] !== "W" && m[1] !== "S" && MB_NAME_NUMBERS[m[1]].test(m[2])) || (m[1] === "S" && Number(m[2]) >= 280) ? null : m[2] },
  "bmw": { re: /\b(E\d{1,2}|[FG]\d{2})\b/g, norm: m => m[1] },
  "porsche": { re: /\b(9\d\d|9Y[0A])(?:\.[12])?\b/g, norm: m => PORSCHE_MODEL_NUMBERS.test(m[1]) ? null : m[1] },
  "toyota": { re: /\b(F[JZ]J?\d{2}|HDJ\d{2}|J\d{2,3}|A[789]0|AE86|AW11|SW20|ZZW30|M[Kk] ?(?:IV|V|I{1,3}|[2-5]))\b/g, norm: m => { const x = m[1].toUpperCase(); const mk = /^MK ?(.+)$/.exec(x); return mk ? "MK" + (ROMAN[mk[1]] || mk[1]) : x; } },
  "lexus": { re: /\b(XF\d{2}|UCF\d{2}|URJ\d{3})\b/g, norm: m => m[1] },
  "nissan": { re: /\b(S30|S130|Z3[1-4]|R3[2-5]|S1[3-5]|KPGC10|PGC10)\b/g, norm: m => m[1] },
  "datsun": { re: /\b(S30|S130|HLS30|PL510|SRL311|SPL311)\b/g, norm: m => m[1] === "HLS30" ? "S30" : m[1] },
  "land rover": { re: /\b(L3[12]\d|L[456]\d\d|P38A?)\b/g, norm: m => m[1].replace(/^P38A$/, "P38") },
  "jeep": { re: /\b(CJ-?\d{1,2}[A-Z]?|YJ|TJ|JK|JL|XJ|ZJ|WJ|WK2?|SJ|MJ|JT)\b/g, norm: m => m[1].replace("-", "") },
  "mazda": { re: /\b(NA|NB|NC|ND|FB|FC|FD)\b/g, norm: m => m[1] },
  "honda": { re: /\b(NA[12]|AP[12]|EK9|DC2|FK8|FL5|NC1)\b/g, norm: m => m[1] },
  "acura": { re: /\b(NA[12]|DC2|NC1)\b/g, norm: m => m[1] },
  "volkswagen": { re: /\bM[Kk] ?(IV|V|I{1,3}|[1-8])\b/g, norm: m => "MK" + (ROMAN[m[1].toUpperCase()] || m[1]) },
  "ford": { re: /\b(SN95|S197|S550|S650|Fox[- ][Bb]ody)\b/g, norm: m => /^fox/i.test(m[1]) ? "FOX" : m[1].toUpperCase() },
  "audi": { re: /\b(B[5-9]|C[4-8]|8[NJS])\b/g, norm: m => m[1] }
};
export const BODY_CHANGE_MAKES = Object.keys(SHAPES);

// the codes one title names (deduped); [] when the make has no shape
export function codesInTitle(make, title) {
  const sh = SHAPES[String(make || "").toLowerCase().trim()];
  if (!sh || !title) return [];
  const out = new Set();
  for (const m of String(title).matchAll(sh.re)) { const k = sh.norm(m); if (k) out.add(k); }
  return [...out];
}

// a code's core year span: the 10th to 90th percentile of its years once it has 10+ sales (a few mis-yeared titles never
// stretch a body), else min to max
function core(years) {
  const ys = [...years].sort((a, b) => a - b);
  if (ys.length >= 10) return [ys[Math.floor(ys.length * 0.1)], ys[Math.ceil(ys.length * 0.9) - 1]];
  return [ys[0], ys[ys.length - 1]];
}

// rows: [{ make, model, year, listing_title }]. A candidate is two codes of ONE make + model, minSales+ sales each, consecutive by
// core start, the later starting after the earlier starts, close enough that some typed year's calendar window (y - 2 .. y + 2)
// reaches both cores. typedYearsThatMix lists those years. Ranked by the two codes' sales. curated: lib/generations.js already
// holds generations for the model (reported apart: the calendar window does not apply there).
export function findBodyChanges(rows, { minSales = 3 } = {}) {
  const by = new Map();
  let named = 0, skippedTwoCodes = 0;
  for (const r of rows || []) {
    const y = Number(r.year); if (!y || y < 1900) continue;
    const codes = codesInTitle(r.make, r.listing_title);
    if (!codes.length) continue;
    if (codes.length > 1) { skippedTwoCodes++; continue; }
    named++;
    const key = `${r.make}|${r.model}`;
    const e = by.get(key) || { make: r.make, model: r.model, codes: new Map() };
    const c = e.codes.get(codes[0]) || { code: codes[0], years: [], titles: [] };
    c.years.push(y); if (c.titles.length < 2) c.titles.push(r.listing_title);
    e.codes.set(codes[0], c); by.set(key, e);
  }
  const candidates = [];
  for (const e of by.values()) {
    const curated = generationsForModel(e.make, e.model).length > 0;
    const cs = [...e.codes.values()].filter(c => c.years.length >= minSales).map(c => ({
      code: c.code, sales: c.years.length, core: core(c.years), allYears: [Math.min(...c.years), Math.max(...c.years)], titles: c.titles
    })).sort((a, b) => a.core[0] - b.core[0] || a.core[1] - b.core[1]);
    for (let i = 0; i + 1 < cs.length; i++) {
      const a = cs[i], b = cs[i + 1];
      if (b.core[0] <= a.core[0]) continue;
      const lo = Math.max(a.core[0], b.core[0] - 2), hi = Math.min(b.core[1], a.core[1] + 2);
      if (hi < lo) continue;
      const typedYearsThatMix = []; for (let y = lo; y <= hi; y++) typedYearsThatMix.push(y);
      candidates.push({ make: e.make, model: e.model, curated, earlier: a, later: b, sales: a.sales + b.sales, typedYearsThatMix });
    }
  }
  candidates.sort((x, y) => y.sales - x.sales);
  return {
    limit: "Only codes the titles NAME are seen; a model whose listings never name a code is invisible here, and a title naming two codes is skipped.",
    titlesNamingOneCode: named, titlesNamingTwoCodesSkipped: skippedTwoCodes,
    candidates: candidates.filter(c => !c.curated), curatedModelsAlsoCrossing: candidates.filter(c => c.curated).map(c => `${c.make} ${c.model} ${c.earlier.code}/${c.later.code}`)
  };
}

// rangepreview bind= (the C63 W205 preview): "Make|Model|code:YYYY-YYYY[,code:YYYY-YYYY]" -> generation entries, or null when
// absent or malformed (at most 6 entries, years 1900 to 2100, start <= end). Read-only use only (lib/generations.js previewGenerations).
export function parsePreviewBind(raw) {
  const m = /^([^|]{2,40})\|([^|]{1,40})\|(.+)$/.exec(String(raw || "").trim());
  if (!m) return null;
  const out = [];
  for (const part of m[3].split(",").slice(0, 6)) {
    const x = /^\s*([A-Za-z0-9.\-]{1,12}):(\d{4})-(\d{4})\s*$/.exec(part);
    if (!x) return null;
    const ys = Number(x[2]), ye = Number(x[3]);
    if (ys < 1900 || ye > 2100 || ys > ye) return null;
    out.push({ make: m[1].trim(), model: m[2].trim(), code: x[1], yearStart: ys, yearEnd: ye });
  }
  return out.length ? out : null;
}
