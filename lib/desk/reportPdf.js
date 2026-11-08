// DESK VALUATIONS: the report, built server side from a FINALISED sheet (docs/desk-valuations-spec.md, "Finalise, PDF, send"). Ten parts in the spec's order, each from the frozen read and the
// sheet's own state (nothing is computed here: every figure is the engine's or the expert's):
//   1 cover  2 the car  3 this exact car  4 the market  5 condition  6 comparables  7 what we cannot see  8 decision with reasons  [note to the seller, its own page, where written]  9 photos selected  10 documents supplied
// The org is the author: its logo at the top of the cover, its name in the footer; no expert's name anywhere (the seat is in the PDF's keywords as watermark data only). Every page carries the footer
// (org, date, report number, methodology line, page) and the org watermark.
import { countNoun } from "../countNoun.js";
import { Doc, textWidth, wrap } from "../pdf/mini.js";
import { CHECKLIST, REASONS, TIER_LABELS, TIER_LADDER, UNTIERED_LADDER } from "./sheetShape.js";
import { markStatement } from "../conditionTier.js";

export const PARTS = ["Cover", "The car", "This exact car", "The market", "Condition", "Comparables", "What we cannot see", "Decision", "Photos selected", "Documents supplied"];
const INK = [0.1, 0.08, 0.06], SLATE = [0.4, 0.37, 0.32], FAINT = [0.57, 0.54, 0.48], LINE = [0.85, 0.82, 0.76], GREEN_DEFAULT = [0.043, 0.361, 0.243];
// the org's own colour (desk_org_settings.brand_color, a hex) for the figure and the marks; the Desk's green when it has none
export const accentOf = hex => { const m = /^#([0-9a-fA-F]{6})$/.exec(String(hex || '')); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255) : GREEN_DEFAULT; };
const M = 54, W = 595, H = 842, TOP = 70, BOTTOM = 96;
const usd = n => n == null ? "n/a" : "$" + Math.round(n).toLocaleString("en-US");
const ns = n => `${Number(n).toLocaleString("en-US")} ${Number(n) === 1 ? "sale" : "sales"}`;   // a count and its noun
const num = n => n == null ? "n/a" : Number(n).toLocaleString("en-US");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || "")); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(d || ""); };
const shortDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || "")); return m ? `${m[1]}-${m[2]}-${m[3]}` : String(d || ""); };

export async function loadImage(url, fetchImage) {
  try {
    if (typeof fetchImage === "function") { const r = await fetchImage(url); return r ? Buffer.from(r) : null; }
    const m = /^data:[^;,]+;base64,(.*)$/.exec(String(url || "")); if (m) return Buffer.from(m[1], "base64");
    if (/^https:\/\//.test(String(url || ""))) { const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000); try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) return null; const b = Buffer.from(await r.arrayBuffer()); return b.length <= 4 * 1024 * 1024 ? b : null; } finally { clearTimeout(t); } }
  } catch {}
  return null;
}

export async function buildReport(sheet, org, { fetchImage, onlyPage, draft = false } = {}) {
  const fin = sheet.final, read = sheet.read, st = sheet.state, dec = fin.decision, ev = fin.evaluation;
  const GREEN = accentOf((fin.org && fin.org.color) || org.color), orgName = (fin.org && fin.org.name) || org.name, logo = org.logo || (fin.org && fin.org.logo), date = longDate(fin.finalisedAt), num_ = fin.reportNumber;
  const doc = new Doc({ title: draft ? `Valuation report DRAFT` : `Valuation report ${num_}`, author: orgName, subject: read.car.label, keywords: draft ? `draft; org=${orgName}` : `report=${num_}; org=${orgName}; seat=${fin.seat}` });
  const partsSeen = []; let y = TOP, pageNo = 0, partName = "", partIdx = 0;
  const T = (s, x, yy, o) => doc.text(x, yy, s, o);
  const startPart = (name, label) => {
    if (pageNo > 0 || doc.cur.ops.length) doc.newPage(); pageNo++; y = TOP; partName = name; partIdx++;
    partsSeen.push(name);
    T(`${typeof label === "number" ? String(label).padStart(2, "0") : label}  ${name.toUpperCase()}`, M, 44, { font: "mono", size: 8.5, color: FAINT }); doc.rule(M, 52, W - M, { color: LINE });
  };
  const ensure = h => { if (y + h > H - BOTTOM) { doc.newPage(); pageNo++; y = TOP; T(`${partName.toUpperCase()}  (continued)`, M, 44, { font: "mono", size: 8.5, color: FAINT }); doc.rule(M, 52, W - M, { color: LINE }); } };
  const h1 = s => { ensure(34); T(s, M, y + 18, { font: "serifb", size: 22, color: INK }); y += 34; };
  const label = s => { ensure(18); T(String(s).toUpperCase(), M, y + 8, { font: "mono", size: 7.5, color: FAINT }); y += 15; };
  const para = (s, o = {}) => { const size = o.size || 11, lines = wrap(s, size, o.font || "serif", (o.w || W - 2 * M)); for (const l of lines) { ensure(size + 5); T(l, o.x || M, y + size, { font: o.font || "serif", size, color: o.color || INK }); y += size + 5; } y += o.gap == null ? 4 : o.gap; };
  const row = (k, v, o = {}) => { ensure(18); T(String(k).toUpperCase(), M, y + 9, { font: "mono", size: 7.5, color: FAINT }); const lines = wrap(v, 10.5, o.mono ? "mono" : "serif", W - 2 * M - 150); lines.forEach((l, i) => { if (i) ensure(15); T(l, M + 150, y + 10 + i * 14, { font: o.mono ? "mono" : "serif", size: 10.5, color: INK }); }); y += Math.max(18, lines.length * 14 + 6); doc.rule(M, y - 3, W - M, { color: [0.93, 0.91, 0.87] }); };

  // 1 cover
  startPart("Cover", 1);
  if (logo) { const b = await loadImage(logo, fetchImage); if (b) doc.image(b, M, y - 6, 150, 46); else T(orgName, M, y + 22, { font: "serifb", size: 16 }); } else T(orgName, M, y + 22, { font: "serifb", size: 16 });
  y += 70; T(draft ? "DRAFT FOR REVIEW, NOT A REPORT" : "VALUATION REPORT", M, y, { font: "mono", size: 8.5, color: draft ? GREEN : FAINT }); y += 28;
  for (const l of wrap(read.car.label, 30, "serifb", W - 2 * M)) { T(l, M, y, { font: "serifb", size: 30, color: INK }); y += 36; }
  T(read.car.vin || "", M, y, { font: "mono", size: 10, color: SLATE }); y += 28;
  const hero = (sheet.submission.photos || []).find(p => p.id === st.heroId);
  if (hero) { const b = await loadImage(hero.url, fetchImage); if (b && doc.image(b, M, y, W - 2 * M, 250)) y += 262; }
  y = Math.max(y, 560);
  const figureOf = () => dec.mode === "reserve" ? usd(Number(dec.reserve)) : dec.mode === "range" ? `${usd(Number(dec.low))} to ${usd(Number(dec.high))}` : "Not set yet";
  label(dec.mode === "reserve" ? "Reserve" : dec.mode === "range" ? "Range" : "Reserve or range");
  T(figureOf(), M, y + 30, { font: "serifb", size: 34, color: GREEN }); y += 52;
  T(date, M, y, { font: "mono", size: 9.5, color: SLATE }); T(`Prepared by ${orgName}`, M, y + 16, { font: "serif", size: 10.5, color: SLATE });

  // 2 the car
  startPart("The car", 2); h1("The car");
  const c = read.car, corr = st.corrections || {};
  row("Vehicle", `${c.decode.year} ${c.decode.make} ${c.decode.model}${c.decode.trim ? " " + c.decode.trim : ""}${c.decode.body ? ", " + c.decode.body : ""}`);
  row("VIN", c.vin, { mono: true }); row("Identified from", c.decode.source === "vin" ? "VIN decode" : "typed description");
  const miles = st.askedMileage || (c.mileage && c.mileage.value); row("Mileage", miles ? `${num(miles)} miles (${st.askedMileage ? "entered" : "from the submission"})` : "Not stated");
  row("Gearbox", corr.gearbox || c.gearbox || "Not stated"); row("Colour", corr.colour || c.colour || "Not stated");
  if (c.prior) row("Last sale", `${shortDate(c.prior.lastSaleDate)}: ${c.prior.mileage ? num(c.prior.mileage) + " miles, " : ""}${c.prior.colour || ""}${c.prior.gearbox ? ", " + c.prior.gearbox : ""}`);

  // 3 this exact car
  startPart("This exact car", 3); h1("This exact car");
  if (!read.exact.appearances.length) para(read.exact.none || "No prior auction record for this VIN.");
  else { label("Auction appearances of this VIN"); for (const a of read.exact.appearances) row(shortDate(a.date), `${a.venue}: ${a.outcome === "sold" ? "sold " + usd(a.price) : "high bid " + usd(a.highBid) + ", not met"}${a.url ? "  " + a.url : ""}`); }

  // 4 the market
  startPart("The market", 4); h1("The market"); const m = read.market;
  row("Window", m.window.stated + (m.window.fallback ? " (the wider window, stated)" : "")); row("Sales", num(m.count)); row("Median", usd(m.median)); row("Typical range", `${usd(m.p25)} to ${usd(m.p75)}`); row("Newest sale", shortDate(m.newest));
  if (m.startingFigure) row("Starting figure", usd(m.startingFigure)); else row("Starting figure", m.startingNote || "None");
  for (const q of m.asks || []) { const o = q.options.find(z => z.value === q.selected); row(`Picked: ${q.noun || q.dimension}`, o ? `${o.label}${q.fromVin ? " (from the VIN)" : ""}` : "Not picked yet"); }
  for (const sp of m.splits || []) { label(`By ${sp.dimension}`); for (const o of sp.options) row(o.label, `${ns(o.count)}, median ${usd(o.median)}${o.low != null ? `, ${usd(o.low)} to ${usd(o.high)}` : ""}${o.windowWords ? ", " + o.windowWords : ""}`); }
  if (m.splitsNote) para(m.splitsNote, { size: 10, color: SLATE });
  if ((m.live || []).length) { label("Live now"); for (const l of m.live) row(l.venue, `bid ${usd(l.bid)}, ends ${shortDate(l.endsAt)}  ${l.title}`); }

  // 5 condition
  startPart("Condition", 5); h1("Condition"); const cd = read.condition;
  row("Tier chosen", cd.selected ? `${cd.selected}  ${TIER_LABELS[cd.selected]}` : "No tier chosen");
  { const mk = fin.mark, line = markStatement(mk); if (line) { row("Analyst", line); if (mk.reason) row("Analyst note", mk.reason); } }
  if (cd.carEvidence) { label("Signals the engine counted for this car"); for (const e of cd.carEvidence.lines) para("-  " + e.line, { size: 10 }); }
  else if (cd.selected && cd.carEvidenceNote) { label("Signals the engine counted for this car"); para(cd.carEvidenceNote, { size: 10, color: SLATE }); }
  for (const t of cd.tiers) row(`Tier ${t.tier}  ${t.label}`, `${ns(t.count)}.  ${(TIER_LADDER[t.tier] || {}).line || ""}`);
  row("Untiered", `${ns(cd.untiered)}.  ${UNTIERED_LADDER.line}. In the wider pool, out of the same tier pool.`);
  if (cd.selected) row("Same tier sales", cd.tooFew ? `${num(cd.sameTierCount)}. ${cd.tooFewLine}` : cd.proofLine || num(cd.sameTierCount));

  // 6 comparables
  startPart("Comparables", 6); h1("Comparables"); para(cd.selected && !cd.tooFew && cd.proofLine ? "Every sale of the same tier, newest first." : cd.selected && !cd.tooFew ? "The same tier pool, newest first." : "The wider pool, newest first.", { size: 10, color: SLATE });
  if (cd.selected && !cd.tooFew && m.startingFigure) para(`${cd.proofLine || `The starting figure ${usd(m.startingFigure)} is the median of the ${countNoun(num(cd.bandCount), "sale", { words: false })} below.`} The sale marked MEDIAN, or the two marked MIDDLE, sit at the starting figure.`, { size: 10, color: SLATE });
  ensure(20); [["DATE", 0], ["VENUE", 62], ["PRICE", 160], ["MILES", 218], ["TIER", 268], ["BAND", 298], ["MARK", 350], ["LINK", 398]].forEach(([k, dx]) => T(k, M + dx, y + 8, { font: "mono", size: 7.5, color: FAINT })); y += 14; doc.rule(M, y, W - M);
  for (const s of (m.comparables || [])) { ensure(16); const out = s.inBand === false, ink = out ? FAINT : INK; T(shortDate(s.date), M, y + 11, { font: "mono", size: 8.5, color: ink }); T(s.venue, M + 62, y + 11, { font: "serif", size: 9.5, color: ink }); T(usd(s.price), M + 160, y + 11, { font: "mono", size: 8.5, color: ink }); T(num(s.mileage), M + 218, y + 11, { font: "mono", size: 8.5, color: ink }); T(String(s.tier == null ? "-" : s.tier), M + 268, y + 11, { font: "mono", size: 8.5, color: ink }); if (s.inBand != null) T(s.inBand ? "IN BAND" : "OUTSIDE", M + 298, y + 11, { font: "mono", size: 7, color: s.inBand ? SLATE : FAINT }); if (s.mid) T(s.mid === "median" ? "MEDIAN" : "MIDDLE", M + 350, y + 11, { font: "mono", size: 7, color: GREEN }); T(String(s.url || "").replace(/^https?:\/\//, "").slice(0, 26), M + 398, y + 11, { font: "mono", size: 7, color: SLATE }); y += 16; }

  // 7 what we cannot see
  startPart("What we cannot see", 7); h1("What we cannot see");
  for (const it of CHECKLIST) { const v = (st.checklist || {})[it.key] || {}; row(it.label, [v.state || "Not marked", v.choice, v.line].filter(Boolean).join(". ")); }

  // 8 decision with reasons: market range, starting figure, reserve or range given, reasons
  startPart("Decision", 8); h1("Decision");
  row("Market range", cd.tooFew ? `Too few sales in this condition; the wider range is ${usd(m.wider && m.wider.low)} to ${usd(m.wider && m.wider.high)}` : `${usd(m.p25)} to ${usd(m.p75)}`);
  row("Starting figure", m.startingFigure ? usd(m.startingFigure) : (m.startingNote || "None"));
  row(dec.mode === "reserve" ? "Reserve given" : dec.mode === "range" ? "Range given" : "Reserve or range", figureOf());
  if (dec.reasons.length) { label("Reasons"); for (const k of dec.reasons) para("-  " + (REASONS.find(r => r.key === k) || { label: k }).label + (k === "other" && dec.otherText ? ": " + dec.otherText : ""), { size: 10.5 }); }
  if (dec.line) { label("Reasoning"); para(dec.line); }
  if (st.pinned) { label("Question asked of the Desk"); para(st.pinned); }
  for (const g of ev.guards || []) if (g.line) { label(g.key === "prior" ? "Against the earlier valuation of this VIN" : "Against the starting figure"); para(g.line); }
  // the note to the seller: its own page, where written
  if (dec.note && dec.note.trim()) { startPart("Note to the seller", "N"); h1("Note to the seller"); para(dec.note, { size: 12 }); }

  // 9 photos selected
  startPart("Photos selected", 9); h1("Photos selected");
  const chosen = (sheet.submission.photos || []).filter(p => (st.photosSelected || []).includes(p.id)).sort((a, b) => (a.id === st.heroId ? -1 : 0) - (b.id === st.heroId ? -1 : 0));
  if (!chosen.length) para("No photos were selected for this report.", { color: SLATE });
  let col = 0, rowTop = y;
  for (const p of chosen) { const b = await loadImage(p.url, fetchImage); if (col === 0) { ensure(180); rowTop = y; } const x = M + col * 250; if (b) doc.image(b, x, rowTop, 240, 170); else T(p.name || "photo", x, rowTop + 20, { font: "mono", size: 8, color: FAINT }); col++; if (col === 2) { col = 0; y = rowTop + 180; } }
  if (col === 1) y = rowTop + 180;

  // 10 documents supplied
  startPart("Documents supplied", 10); h1("Documents supplied");
  const docs = sheet.submission.documents || [];
  if (!docs.length) para("No documents were supplied.", { color: SLATE }); else { para("Listed by name. The documents are not reproduced here.", { size: 10, color: SLATE }); for (const d of docs) para("-  " + d.name, { size: 10.5, gap: 1 }); }

  // footer and watermark on every page
  const n = doc.pages.length, saved = doc.cur;
  doc.pages.forEach((pg, i) => {
    doc.cur = pg; doc.watermark(draft ? "DRAFT" : orgName.toUpperCase(), draft ? { size: 90 } : { size: Math.max(22, Math.min(46, Math.floor(430 / (orgName.length * 0.7)))) });
    doc.rule(M, H - 84, W - M, { color: LINE });
    T(draft ? `${orgName}   DRAFT, not a report   no report number` : `${orgName}   ${date}   Report ${num_}`, M, H - 70, { font: "mono", size: 8, color: SLATE }); T(`Page ${i + 1} of ${n}`, W - M - 60, H - 70, { font: "mono", size: 8, color: SLATE });
    wrap(read.coverage.methodology, 7.5, "sans", W - 2 * M).slice(0, 3).forEach((l, k) => T(l, M, H - 56 + k * 10, { font: "sans", size: 7.5, color: FAINT }));
  });
  doc.cur = saved;
  const core = partsSeen.filter(p => PARTS.includes(p));
  return { bytes: doc.build(onlyPage), filename: draft ? `DRAFT-${String(sheet.id || "sheet").slice(0, 8)}.pdf` : `${num_}.pdf`, parts: partsSeen, coreParts: core, pages: n };
}
