// THE FIGURE SCAN (Desk Valuations checks): every figure printed on a page or a report must be one the object it was printed from carries. allowedFigures(object) is every number in the object and every
// run of digits in its strings, with and without thousands commas; figuresIn(text) is every number printed. A figure printed that the object does not carry is a figure somebody computed.
export function allowedFigures(...objs) {
  const set = new Set(), add = x => { const s = String(x).replace(/,/g, ""); set.add(s); const m = /^(\d+)\.0+$/.exec(s); if (m) set.add(m[1]); };
  const walk = v => {
    if (v == null) return; if (typeof v === "number") { if (Number.isFinite(v)) { add(v); add(Math.round(v)); } return; }
    if (typeof v === "string") { for (const m of v.matchAll(/\d[\d,]*(?:\.\d+)?/g)) { add(m[0]); for (const p of m[0].split(/[.,]/)) if (p) add(p); } return; }
    if (Array.isArray(v)) { v.forEach(walk); return; } if (typeof v === "object") Object.values(v).forEach(walk);
  };
  objs.forEach(walk); return set;
}
export function figuresIn(text) { return [...String(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => m[0].replace(/,/g, "")); }
export function unexplained(text, allowed, extra = []) { const ex = new Set(extra.map(String)); return [...new Set(figuresIn(text).filter(f => !allowed.has(f) && !ex.has(f)))]; }
