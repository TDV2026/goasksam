// DESK V3: THE REPORT, FOUR PAGES, TO THE WIREFRAME (Lane D, Nov 9 2026; docs/desk-mockups/desk-v3-wireframe.html, the Customer report view). Built from the case (lib/desk/reportState.js is every sentence and figure; this file only places them).
//   page 1  the cover photo as a band over the top half with the identification block overlapping its edge; the likely selling price and the recommended reserve, each with its sentence; the lead
//   page 2  "Where your car sits among real sales": the dot strip with its labels and caption; "What supports it" and "What to consider"; the condition box
//   page 3  the closest sales as equal cards: photo or the no photo card, price, venue and month, name and miles, why, the link; the footnote
//   page 4  two columns: how the market has moved (quarter bars), on the market now; what we suggest next, please note, contact
// Decided and kept: no analyst name anywhere ("Prepared by" is the org, the contact block is the org row's), the paper is an org setting (Letter by default, A4), Newsreader and Instrument Sans embedded, and nothing prints that a
// case field does not carry. A section with nothing to say is left out. DRAFT is a watermark on a preview only. Every page: org, report number, date, version, "Page n of 4".
import { Doc } from "../pdf/mini.js";
import { reportFonts } from "../pdf/fonts.js";
import { accentOf, loadImage } from "./reportPdf.js";
import { reportState, longDate } from "./reportState.js";
import { coverOf } from "./sheetShape.js";
import { moneyWords } from "../reasonWords.js";

export const PARTS_V3 = ["Cover", "The market", "Comparables", "Next steps"];
export const PAPERS = { letter: [612, 792], a4: [595, 842] };   // an org setting (desk_orgs.settings.paper): Letter by default, A4 when the row says so
const INK = [0.1, 0.08, 0.06], SLATE = [0.4, 0.37, 0.32], FAINT = [0.57, 0.54, 0.48], LINE = [0.85, 0.82, 0.76], PALE = [0.96, 0.95, 0.92], WARN = [0.7, 0.4, 0.08], WHITE = [1, 1, 1];
const M = 44, TOP = 76;

export async function buildReportV3(sheet, org, { fetchImage, draft = false, onlyPage } = {}) {
  const [W, H] = PAPERS[String(org.paper || "").toLowerCase() === "a4" ? "a4" : "letter"], FOOT = H - 52;
  const c = sheet.case, rs = reportState(c), fin = sheet.final || {}, ACC = accentOf((fin.org && fin.org.color) || org.color);
  const orgName = (fin.org && fin.org.name) || org.name, logo = org.logo || (fin.org && fin.org.logo), number = draft ? null : fin.reportNumber || null;
  const when = longDate(draft ? new Date().toISOString() : c.finalized_at || fin.finalisedAt), car = [rs.identification.year, rs.identification.make, rs.identification.model, rs.identification.trim].filter(Boolean).join(" ");
  const doc = new Doc({ embed: reportFonts(), w: W, h: H, title: draft ? "Valuation report DRAFT" : `Valuation report ${number || ""}`.trim(), author: orgName, subject: car || "Valuation report", keywords: draft ? `draft; org=${orgName}` : `report=${number}; version=${c.version}; org=${orgName}` });
  const T = (s, x, y, o) => doc.text(x, y, s, o);
  const right = (s, xr, y, o) => doc.text(xr - doc.measure(s, o.size || 10, o.font || "serif"), y, s, o);
  const para = (s, x, y, w, o = {}) => { const size = o.size || 10.5, lh = o.lh || size + 4, lines = doc.wrap(String(s), size, o.font || "serif", w); let yy = y; for (const l of lines.slice(0, o.max || 99)) { T(l, x, yy + size, { font: o.font || "serif", size, color: o.color || INK }); yy += lh; } return yy; };
  const eyebrow = (s, x, y, o = {}) => T(String(s).toUpperCase(), x, y + 8, { font: "sans", size: o.size || 7.5, color: o.color || FAINT });
  const h3 = (s, x, y, w) => { T(s, x, y + 13, { font: "serifb", size: 14, color: INK }); doc.rule(x, y + 20, x + w, { color: INK, width: 1.4 }); return y + 28; };
  const logoBytes = logo ? await loadImage(logo, fetchImage) : null;
  // the running head: the org's boxed logo at the left, the page's title at the right
  const head = async (title, onPhoto) => {
    if (onPhoto) doc.rect(M - 10, 22, W - 2 * M + 20, 32, { fill: WHITE });
    if (logoBytes && doc.image(logoBytes, M, 28, 96, 20)) {} else { const w = doc.measure(orgName.toUpperCase(), 8, "sansb") + 22; doc.rect(M, 28, w, 20, { fill: onPhoto ? WHITE : [1, 1, 1], stroke: INK }); T(orgName.toUpperCase(), M + 11, 41, { font: "sansb", size: 8, color: INK }); }
    right(title, W - M, 42, { font: "sans", size: 7.5, color: FAINT });
  };
  const foot = n => { doc.rule(M, FOOT, W - M, { color: LINE }); T([`Prepared by ${orgName}`, number, when, draft ? "Draft preview" : `Version ${c.version}`].filter(Boolean).join("   "), M, FOOT + 16, { font: "sans", size: 7.5, color: FAINT }); right(`Page ${n} of 4`, W - M, FOOT + 16, { font: "sans", size: 7.5, color: FAINT }); if (draft) doc.watermark("DRAFT"); };
  const colW = (W - 2 * M - 24) / 2;

  // ---------- 1 cover
  const heroH = Math.round(H * 0.5), hero = (sheet.submission.photos || []).find(p => p.id === (c.photos.coverId || coverOf(sheet.submission, sheet.state || {}))), heroBytes = hero ? await loadImage(hero.url, fetchImage) : null;
  if (heroBytes && doc.imageCover(heroBytes, 0, 0, W, heroH)) {} else doc.rect(0, 0, W, heroH, { fill: PALE });   // no cover photo: a typographic cover on a plain band, never a placeholder picture
  await head(["Market assessment", ...rs.header].join("  ·  "), !!heroBytes);
  doc.rect(M, heroH - 82, W - 2 * M, 83, { fill: WHITE });
  let ty = heroH - 82 + 14; for (const l of doc.wrap(car || "Vehicle", 27, "serifb", W - 2 * M - 40).slice(0, 2)) { T(l, M + 20, ty + 27, { font: "serifb", size: 27, color: INK }); ty += 31; }
  if (rs.eyebrow.length) T(rs.eyebrow.join("  ·  ").toUpperCase(), M + 20, heroH - 12, { font: "sans", size: 7.5, color: FAINT });
  let y = heroH + 26;
  eyebrow("Likely selling price", M, y); eyebrow("Recommended reserve", M + colW + 24, y);
  T(c.assessment.low != null ? `${moneyWords(c.assessment.low)} to ${moneyWords(c.assessment.high)}` : "Not set", M, y + 42, { font: "serifb", size: 26, color: ACC });
  T(c.reserve.figure != null ? moneyWords(c.reserve.figure) : "Not set", M + colW + 24, y + 42, { font: "serifb", size: 26, color: ACC });
  let ya = y + 52, yb = y + 52; for (const l of rs.priceBasis) ya = para(l, M, ya, colW, { size: 9.5, color: SLATE, max: 3 }) + 1;
  for (const l of rs.reserveNote) yb = para(l, M + colW + 24, yb, colW, { size: 9.5, color: SLATE, max: 4 }) + 1;
  y = Math.max(ya, yb) + 12; doc.rule(M, y, W - M, { color: LINE }); y += 8;
  for (const l of rs.lead) y = para(l, M, y, W - 2 * M - 20, { size: 11.5, lh: 17, max: 6 }) + 4;
  foot(1);

  // ---------- 2 where the car sits
  doc.newPage(); await head("Why we recommend it", false); y = TOP;
  T("Where your car sits among real sales", M, y + 22, { font: "serifb", size: 21, color: INK }); y += 40;
  if (rs.strip) {
    const sx = M + 4, sw = W - 2 * M - 8, X = p => sx + (p / 100) * sw, cy = y + 56, sp = rs.strip;
    doc.rect(sx, cy - 6, sw, 12, { fill: PALE });
    doc.rect(X(sp.q1Pct), cy - 6, X(sp.q3Pct) - X(sp.q1Pct), 12, { fill: [0.82, 0.88, 0.84] });
    for (const d of sp.dots) doc.circle(X(d.pct), cy - 14, 2.6, { fill: [0.5, 0.58, 0.54] });
    doc.line(X(sp.medianPct), cy - 18, X(sp.medianPct), cy + 18, { color: [0.2, 0.4, 0.32], width: 2 });
    if (sp.assessLowPct != null) doc.rect(X(sp.assessLowPct), cy - 2, Math.max(2, X(sp.assessHighPct) - X(sp.assessLowPct)), 4, { fill: ACC });
    if (sp.reservePct != null) doc.line(X(sp.reservePct), cy - 22, X(sp.reservePct), cy + 22, { color: ACC, width: 1.6, dash: [2, 2] });
    if (sp.labels.range) { const mid = X((sp.assessLowPct + sp.assessHighPct) / 2), w = doc.measure(sp.labels.range, 8.5, "sansb"); T(sp.labels.range, Math.min(Math.max(mid - w / 2, sx), sx + sw - w), cy - 30, { font: "sansb", size: 8.5, color: ACC }); }
    T(sp.labels.low, Math.max(X(sp.lowPct), sx), cy + 34, { font: "sans", size: 8, color: SLATE });
    { const w = doc.measure(sp.labels.high, 8, "sans"); T(sp.labels.high, Math.min(X(sp.highPct), sx + sw) - w, cy + 34, { font: "sans", size: 8, color: SLATE }); }
    { const w = doc.measure(sp.labels.median, 8, "sansb"); T(sp.labels.median, Math.min(Math.max(X(sp.medianPct) - w / 2, sx), sx + sw - w), cy + 48, { font: "sansb", size: 8, color: [0.2, 0.4, 0.32] }); }
    if (sp.labels.reserve) { const w = doc.measure(sp.labels.reserve, 8, "sansb"); T(sp.labels.reserve, Math.min(Math.max(X(sp.reservePct) - w / 2, sx), sx + sw - w), cy + 62, { font: "sansb", size: 8, color: ACC }); }
    y = cy + 78; for (const l of sp.caption) y = para(l, M, y, W - 2 * M, { size: 9, color: SLATE }) + 0;
  } else if (rs.insufficientLine) y = para(rs.insufficientLine, M, y, W - 2 * M);
  y += 14;
  if (rs.supportItems.length || rs.considerItems.length) {
    const x2 = M + colW + 24; let ya2 = h3(rs.headings.supports, M, y, colW), yb2 = h3(rs.headings.consider, x2, y, colW);
    const item = (x, yy, ic, col, title, text) => { doc.circle(x + 8, yy + 9, 7.5, { fill: PALE }); T(ic, x + 8 - doc.measure(ic, 9, "sansb") / 2, yy + 12.5, { font: "sansb", size: 9, color: col }); let ty2 = yy; if (title) { T(title, x + 24, ty2 + 10.5, { font: "sansb", size: 9.5, color: INK }); ty2 += 13; } ty2 = para(text, x + 24, ty2, colW - 26, { size: 9.5, color: title ? SLATE : INK, max: 4 }); doc.rule(x, ty2 + 3, x + colW, { color: [0.92, 0.9, 0.86] }); return ty2 + 8; };
    for (const it of rs.supportItems.slice(0, 5)) ya2 = item(M, ya2, "+", ACC, it.title, it.text);
    for (const it of rs.considerItems.slice(0, 5)) yb2 = item(x2, yb2, "!", WARN, null, it);
    y = Math.max(ya2, yb2) + 6;
  }
  if (rs.conditionBox) {
    const bw = W - 2 * M, lines = doc.wrap(`${rs.conditionBox.text} ${rs.conditionBox.note}`, 9.5, "serif", bw - 150).slice(0, 5), bh = Math.max(46, lines.length * 13.5 + 20);
    doc.rect(M, y, bw, bh, { fill: WHITE, stroke: LINE }); T(rs.conditionBox.name, M + 14, y + bh / 2 + 7, { font: "serifb", size: 20, color: INK });
    let yy = y + (bh - lines.length * 13.5) / 2; for (const l of lines) { T(l, M + 140, yy + 9.5, { font: "serif", size: 9.5, color: INK }); yy += 13.5; }
    y += bh + 6;
  }
  foot(2);

  // ---------- 3 the cars that support it
  doc.newPage(); await head("The cars that support it", false); y = TOP;
  T(rs.compsHeading, M, y + 22, { font: "serifb", size: 21, color: INK }); y += 50;
  const cw = (W - 2 * M - 20) / 2, ih = Math.round(cw * 10 / 16), ch = ih + 112, photos = await Promise.all(rs.comparables.map(cm => (cm.photo ? loadImage(cm.photo, fetchImage) : null)));
  for (let i = 0; i < rs.comparables.length; i++) {
    const cm = rs.comparables[i], x = M + (i % 2) * (cw + 20), yy = y + Math.floor(i / 2) * (ch + 14);
    if (photos[i] && doc.imageCover(photos[i], x, yy, cw, ih)) {} else { doc.rect(x, yy, cw, ih, { fill: [0.87, 0.92, 0.89] }); const ls = doc.wrap(rs.noPhotoLine, 11, "serif", cw - 40); let ly = yy + ih / 2 - ls.length * 7; for (const l of ls) { T(l, x + cw / 2 - doc.measure(l, 11, "serif") / 2, ly + 11, { font: "serif", size: 11, color: [0.2, 0.4, 0.32] }); ly += 14; } }   // a sale with no photo: the same slot, words in it, no picture
    let ty2 = yy + ih + 8;
    T(moneyWords(cm.price), x, ty2 + 17, { font: "serifb", size: 18, color: INK }); right([cm.venue, cm.monthYear].filter(Boolean).join("  ·  "), x + cw, ty2 + 16, { font: "sans", size: 8, color: SLATE });
    ty2 += 24; ty2 = para([cm.title, cm.milesWords].filter(Boolean).join("  ·  "), x, ty2, cw, { font: "sansb", size: 9, max: 2 });
    if (cm.why) ty2 = para(cm.why, x, ty2 + 1, cw, { size: 9.5, color: SLATE, max: 3 });
    if (cm.url) { T(rs.viewListing, x, yy + ch - 12, { font: "sans", size: 8, color: SLATE }); doc.link(x, yy + ch - 24, 120, 14, cm.url); }
  }
  y += Math.ceil(rs.comparables.length / 2) * (ch + 14) + 2;
  for (const l of rs.compsFoot) y = para(l, M, y, W - 2 * M, { size: 8.5, color: SLATE }) + 0;
  foot(3);

  // ---------- 4 market context and next steps
  doc.newPage(); await head("Market context and next steps", false); y = TOP;
  let yl = y, yr = y; const x2 = M + colW + 24;
  if (rs.quarterBars.some(b => b.shown)) {   // a chart of nothing but empty slots is not printed
    yl = h3("How the market has moved", M, yl, colW);
    const bars = rs.quarterBars, mx = Math.max(...bars.filter(b => b.shown).map(b => b.median), 1), bw = Math.min(46, (colW - 4 * (bars.length - 1)) / bars.length), gap = bars.length > 1 ? (colW - bw * bars.length) / (bars.length - 1) : 0, base = yl + 96;
    bars.forEach((b, i) => { const bx = M + i * (bw + gap); if (b.shown) { const bh = Math.max(6, (b.median / mx) * 66); doc.rect(bx, base - bh, bw, bh, { fill: [0.68, 0.8, 0.74] }); const v = moneyWords(b.median); T(v, bx + bw / 2 - doc.measure(v, 7.5, "sans") / 2, base - bh - 4, { font: "sans", size: 7.5, color: SLATE }); } else { doc.rect(bx, base - 22, bw, 22, { fill: WHITE, stroke: LINE }); } T(b.label, bx + bw / 2 - doc.measure(b.label, 7, "sans") / 2, base + 11, { font: "sans", size: 7, color: FAINT }); });
    doc.rule(M, base, M + colW, { color: LINE }); yl = base + 20; for (const l of rs.quarterCaption) yl = para(l, M, yl, colW, { size: 8.5, color: SLATE }) + 0; yl += 12;
  }
  if (rs.liveRows.length) {
    yl = h3("On the market now", M, yl, colW);
    for (const r of rs.liveRows) { const w = doc.measure(r.right, 8, "sansb"), y0 = yl; yl = para(r.left, M, yl, colW - w - 14, { size: 9.5, max: 2 }); right(r.right, M + colW, y0 + 10, { font: "sansb", size: 8, color: SLATE }); doc.rule(M, yl + 2, M + colW, { color: [0.92, 0.9, 0.86] }); if (r.url) doc.link(M, y0, colW, yl - y0 + 2, r.url); yl += 7; }
    if (rs.liveCaption) yl = para(rs.liveCaption, M, yl, colW, { size: 8.5, color: SLATE }) + 8;
  }
  yr = h3("What we suggest next", x2, yr, colW);
  rs.nextSteps.forEach((l, i) => { T(`${i + 1}.`, x2, yr + 12, { font: "sansb", size: 9.5, color: INK }); yr = para(l, x2 + 16, yr, colW - 16, { size: 10, max: 4 }) + 3; }); yr += 8;
  if (rs.pleaseNote.length) { yr = h3("Please note", x2, yr, colW); yr = para(rs.pleaseNote.join(" "), x2, yr, colW, { size: 9.5, max: 12 }) + 10; }
  // contact: the org's own details from its row, the reference and the version; never an analyst
  const cy4 = Math.max(yr, yl, FOOT - 120) + 0; doc.rule(x2, cy4, x2 + colW, { color: LINE });
  let c1 = cy4 + 8; T(orgName, x2, c1 + 9, { font: "sansb", size: 8.5, color: INK }); c1 += 13; for (const l of [org.contactAddress, org.contactPhone, org.contactEmail].filter(Boolean)) { c1 = para(l, x2, c1, colW / 2 - 6, { font: "sans", size: 8, color: SLATE, lh: 11, max: 2 }); }
  let c2 = cy4 + 8; const x3 = x2 + colW / 2 + 6; if (rs.reference) { T(`Reference ${rs.reference}`, x3, c2 + 9, { font: "sansb", size: 8.5, color: INK }); c2 += 13; } T(`${draft ? "Draft" : `Version ${c.version}`}${when ? `, ${when}` : ""}`, x3, c2 + 9, { font: "sans", size: 8, color: SLATE });
  foot(4);

  const bytes = doc.build(onlyPage);
  return { filename: draft ? "Valuation-report-DRAFT.pdf" : `Valuation-report-${number}.pdf`, bytes, parts: PARTS_V3, pages: 4 };
}
