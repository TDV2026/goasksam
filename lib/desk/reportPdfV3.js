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
import { moneyWords, reasonLine } from "../reasonWords.js";

export const PARTS_V3 = ["Cover", "Why this reserve", "The sales behind it", "What happens next"];
export const PAPERS = { letter: [612, 792], a4: [595, 842] };   // an org setting (desk_orgs.settings.paper): Letter by default, A4 when the row says so
const INK = [0.1, 0.08, 0.06], SLATE = [0.4, 0.37, 0.32], FAINT = [0.57, 0.54, 0.48], LINE = [0.85, 0.82, 0.76], PALE = [0.96, 0.95, 0.92], WARN = [0.7, 0.4, 0.08], WHITE = [1, 1, 1];
const M = 44, TOP = 76;

export async function buildReportV3(sheet, org, { fetchImage, draft = false, onlyPage } = {}) {
  const [W, H] = PAPERS[String(org.paper || "").toLowerCase() === "a4" ? "a4" : "letter"], FOOT = H - 52;
  const c = sheet.case, rs = reportState(c), fin = sheet.final || {}, ACC = accentOf((fin.org && fin.org.color) || org.color);
  const orgName = (fin.org && fin.org.name) || org.name, logo = org.logo || (fin.org && fin.org.logo), number = draft ? null : fin.reportNumber || null;
  const when = longDate(draft ? new Date().toISOString() : c.finalized_at || fin.finalisedAt), car = [rs.identification.year, rs.identification.make, rs.identification.model, rs.identification.trim].filter(Boolean).join(" ");
  const doc = new Doc({ embed: reportFonts(), w: W, h: H, title: draft ? reasonLine("report.title_draft") : reasonLine("report.title_final", { number: number || "" }).trim(), author: orgName, subject: car || reasonLine("report.name"), keywords: draft ? `draft; org=${orgName}` : `report=${number}; version=${c.version}; org=${orgName}` });
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

  // DESK V4 (Lane D, Nov 10 2026; docs/desk-mockups/desk-v4.html "Report rules"). Every sentence and figure is rs.v4 (lib/desk/reportState.js); this file only places them. The assessment range and the listings for sale elsewhere are not printed.
  const v = rs.v4, nameLines = doc.wrap(v.title || "Vehicle", 27, "serifb", W - 2 * M).slice(0, 2);
  // ---------- 1 cover: the photo across the top half, the car's name, ONE figure with how many sales reached it, three tiles, the reason
  const heroH = Math.round(H * 0.46), hero = (sheet.submission.photos || []).find(p => p.id === (c.photos.coverId || coverOf(sheet.submission, sheet.state || {}))), heroBytes = hero ? await loadImage(hero.url, fetchImage) : null;
  if (heroBytes && doc.imageCover(heroBytes, 0, 0, W, heroH)) {} else doc.rect(0, 0, W, heroH, { fill: PALE });   // no cover photo: a plain band, never a placeholder picture
  await head([v.head.cover, ...rs.header.slice(0, 1)].join("  ·  "), !!heroBytes);
  let y = heroH + 22;
  if (v.preparedFor) { eyebrow([v.preparedFor, rs.header[1]].filter(Boolean).join("  ·  "), M, y); y += 14; }
  for (const l of nameLines) { T(l, M, y + 27, { font: "serifb", size: 27, color: INK }); y += 31; }
  if (v.specLine) y = para(v.specLine, M, y + 2, W - 2 * M, { font: "sans", size: 9.5, color: SLATE, max: 2 }) + 6;
  y += 8; doc.rule(M, y, W - M, { color: LINE }); y += 12;
  const lw = 210; eyebrow(v.label, M, y); T(v.figure != null ? moneyWords(v.figure) : "Not set", M, y + 48, { font: "serifb", size: 38, color: ACC });
  let yr2 = y; if (v.reachedLine) yr2 = para(v.reachedLine, M + lw + 20, yr2 + 4, W - 2 * M - lw - 20, { font: "sansb", size: 10.5, color: INK, max: 3 }) + 4;
  if (v.note) yr2 = para(v.note, M + lw + 20, yr2, W - 2 * M - lw - 20, { size: 9.5, color: SLATE, max: 4 });
  y = Math.max(y + 62, yr2) + 12;
  if (v.tiles.length) { const tw = (W - 2 * M - 12 * (v.tiles.length - 1)) / v.tiles.length; v.tiles.forEach((t, i) => { const x = M + i * (tw + 12); doc.rect(x, y, tw, 60, { fill: PALE }); para(t.value, x + 10, y + 8, tw - 20, { font: "serifb", size: 13, lh: 15, max: 2, color: INK }); para(t.label, x + 10, y + 38, tw - 20, { font: "sans", size: 7.5, lh: 9, max: 2, color: SLATE }); }); y += 74; }
  if (v.why) y = para(v.why, M, y, W - 2 * M, { size: 11.5, lh: 17, max: 6 }) + 4;
  foot(1);

  // ---------- 2 why this reserve: every sale as a dot with the reserve marked, what supports it, what was taken into account, the seller's photographs
  doc.newPage(); await head(v.head.why, false); y = TOP;
  if (v.stripHeading) { T(v.stripHeading, M, y + 22, { font: "serifb", size: 21, color: INK }); y += 40; }
  if (v.strip) {
    const sx = M + 4, sw = W - 2 * M - 8, X = q => sx + (q / 100) * sw, cy = y + 40, sp = v.strip;
    doc.rect(sx, cy - 6, sw, 12, { fill: PALE });
    doc.rect(X(sp.q1Pct), cy - 6, X(sp.q3Pct) - X(sp.q1Pct), 12, { fill: [0.82, 0.88, 0.84] });
    for (const d of sp.dots) doc.circle(X(d.pct), cy - 14, 2.6, { fill: [0.5, 0.58, 0.54] });
    doc.line(X(sp.medianPct), cy - 18, X(sp.medianPct), cy + 18, { color: [0.2, 0.4, 0.32], width: 2 });
    if (sp.reservePct != null) doc.line(X(sp.reservePct), cy - 22, X(sp.reservePct), cy + 22, { color: ACC, width: 1.6, dash: [2, 2] });
    T(sp.labels.low, Math.max(X(sp.lowPct), sx), cy + 34, { font: "sans", size: 8, color: SLATE });
    { const w = doc.measure(sp.labels.high, 8, "sans"); T(sp.labels.high, Math.min(X(sp.highPct), sx + sw) - w, cy + 34, { font: "sans", size: 8, color: SLATE }); }
    { const w = doc.measure(sp.labels.median, 8, "sansb"); T(sp.labels.median, Math.min(Math.max(X(sp.medianPct) - w / 2, sx), sx + sw - w), cy + 48, { font: "sansb", size: 8, color: [0.2, 0.4, 0.32] }); }
    if (sp.labels.reserve) { const w = doc.measure(sp.labels.reserve, 8, "sansb"); T(sp.labels.reserve, Math.min(Math.max(X(sp.reservePct) - w / 2, sx), sx + sw - w), cy + 62, { font: "sansb", size: 8, color: ACC }); }
    y = cy + 78; for (const l of sp.caption) y = para(l, M, y, W - 2 * M, { size: 9, color: SLATE }) + 0;
  } else if (rs.insufficientLine) y = para(rs.insufficientLine, M, y, W - 2 * M);
  y += 12;
  if (v.supports.length || v.considered.length) {
    const x2 = M + colW + 24; let ya2 = h3(v.headings.supports, M, y, colW), yb2 = h3(v.headings.considered, x2, y, colW);
    const item = (x, yy, ic, col, title, text) => { doc.circle(x + 8, yy + 9, 7.5, { fill: PALE }); T(ic, x + 8 - doc.measure(ic, 9, "sansb") / 2, yy + 12.5, { font: "sansb", size: 9, color: col }); let ty2 = yy; if (title) { T(title, x + 24, ty2 + 10.5, { font: "sansb", size: 9.5, color: INK }); ty2 += 13; } return para(text, x + 24, ty2, colW - 24, { size: 9.5, color: SLATE, max: 4 }) + 6; };
    for (const it of v.supports.slice(0, 5)) ya2 = item(M, ya2, "+", ACC, it.title, it.text);
    for (const it of v.considered.slice(0, 5)) yb2 = item(x2, yb2, "!", WARN, it.title, it.text);
    y = Math.max(ya2, yb2) + 10;
  }
  { const shots = v.photoIds.map(id => (sheet.submission.photos || []).find(p => p.id === id)).filter(Boolean), bytesList = await Promise.all(shots.map(p => loadImage(p.url, fetchImage))), got = bytesList.filter(Boolean);
    if (got.length && y + 110 < FOOT) { const n = got.length, gw = (W - 2 * M - 8 * (n - 1)) / n, gh = Math.min(96, FOOT - y - 30); got.forEach((b, i) => doc.imageCover(b, M + i * (gw + 8), y, gw, gh)); para(v.photosCaption, M, y + gh + 4, W - 2 * M, { font: "sans", size: 7.5, color: FAINT }); } }
  foot(2);

  // ---------- 3 the sales behind it: two to four closest sales, each with its own listing photograph or none, and the engine's evidence note
  doc.newPage(); await head(v.head.sales, false); y = TOP;
  T(v.compsHeading, M, y + 22, { font: "serifb", size: 21, color: INK }); y += 50;
  const cw = (W - 2 * M - 20) / 2, ih = Math.round(cw * 10 / 16), ch = ih + 112, photos = await Promise.all(rs.comparables.map(cm => (cm.photo ? loadImage(cm.photo, fetchImage) : null)));
  for (let i = 0; i < rs.comparables.length; i++) {
    const cm = rs.comparables[i], x = M + (i % 2) * (cw + 20), yy = y + Math.floor(i / 2) * (ch + 14);
    if (photos[i] && doc.imageCover(photos[i], x, yy, cw, ih)) {} else { doc.rect(x, yy, cw, ih, { fill: [0.87, 0.92, 0.89] }); const ls = doc.wrap(rs.noPhotoLine, 11, "serif", cw - 40); let ly = yy + ih / 2 - ls.length * 7; for (const l of ls) { T(l, x + cw / 2 - doc.measure(l, 11, "serif") / 2, ly + 11, { font: "serif", size: 11, color: SLATE }); ly += 14; } }
    let ty2 = yy + ih + 8;
    T(moneyWords(cm.price), x, ty2 + 17, { font: "serifb", size: 18, color: INK }); right([cm.venue, cm.monthYear].filter(Boolean).join("  ·  "), x + cw, ty2 + 16, { font: "sans", size: 8, color: SLATE });
    ty2 += 24; ty2 = para([cm.title, cm.milesWords].filter(Boolean).join("  ·  "), x, ty2, cw, { font: "sansb", size: 9, max: 2 });
    if (cm.why) ty2 = para(cm.why, x, ty2 + 1, cw, { size: 9.5, color: SLATE, max: 3 });
    if (cm.url) { T(rs.viewListing, x, yy + ch - 12, { font: "sans", size: 8, color: SLATE }); doc.link(x, yy + ch - 24, 120, 14, cm.url); }
  }
  y += Math.ceil(rs.comparables.length / 2) * (ch + 14) + 2;
  if (v.aboutLine) { const lines = doc.wrap(v.aboutLine, 9, "serif", W - 2 * M - 28).slice(0, 5), bh = lines.length * 12.5 + 34; doc.rect(M, y, W - 2 * M, bh, { fill: PALE }); eyebrow(v.headings.about, M + 14, y + 8); let yy = y + 24; for (const l of lines) { T(l, M + 14, yy + 9, { font: "serif", size: 9, color: SLATE }); yy += 12.5; } }
  foot(3);

  // ---------- 4 what happens next, set large; the trend only when every quarter has enough sales; the note and the contact
  doc.newPage(); await head(v.head.next, false); y = TOP;
  T(v.head.next, M, y + 22, { font: "serifb", size: 21, color: INK }); y += 46;
  v.nextSteps.forEach((l, i) => { T(`${i + 1}`, M, y + 16, { font: "serifb", size: 17, color: ACC }); y = para(l, M + 26, y, W - 2 * M - 26, { size: 13, lh: 18, max: 4 }) + 8; });
  y += 10; let yl = y, yr = y; const x2 = M + colW + 24;
  if (v.trend) {
    yl = h3(v.headings.trend, M, yl, colW);
    const bars = v.trend.bars, mx = Math.max(...bars.map(b => b.median), 1), bw = Math.min(46, (colW - 4 * (bars.length - 1)) / bars.length), gap = bars.length > 1 ? (colW - bw * bars.length) / (bars.length - 1) : 0, base = yl + 96;
    bars.forEach((b, i) => { const bx = M + i * (bw + gap), bh = Math.max(6, (b.median / mx) * 66); doc.rect(bx, base - bh, bw, bh, { fill: [0.68, 0.8, 0.74] }); const val = moneyWords(b.median); T(val, bx + bw / 2 - doc.measure(val, 7.5, "sans") / 2, base - bh - 4, { font: "sans", size: 7.5, color: SLATE }); const lb = String(b.label); T(lb, bx + bw / 2 - doc.measure(lb, 7.5, "sans") / 2, base + 11, { font: "sans", size: 7.5, color: SLATE }); });
    doc.rule(M, base, M + colW, { color: LINE }); yl = para(v.trend.caption, M, base + 20, colW, { size: 8.5, color: SLATE }) + 8;
  }
  if (v.pleaseNote.length) { yr = h3(v.headings.note, x2, yr, colW); yr = para(v.pleaseNote.join(" "), x2, yr, colW, { size: 9.5, max: 12 }) + 10; }
  const cy4 = Math.max(yr, yl, FOOT - 120) + 0; doc.rule(M, cy4, W - M, { color: LINE });
  let c1 = cy4 + 8; T(orgName, M, c1 + 9, { font: "sansb", size: 8.5, color: INK }); c1 += 13; for (const l of [org.contactAddress, org.contactPhone, org.contactEmail].filter(Boolean)) c1 = para(l, M, c1, colW, { font: "sans", size: 8, color: SLATE });
  let c2 = cy4 + 8; if (v.reference) { T(`Reference ${v.reference}`, x2, c2 + 9, { font: "sansb", size: 8.5, color: INK }); c2 += 13; } T(`${draft ? "Draft" : `Version ${c.version}`}${when ? `, ${when}` : ""}`, x2, c2 + 9, { font: "sans", size: 8, color: SLATE });
  foot(4);

  const bytes = doc.build(onlyPage);
  return { filename: draft ? "Valuation-report-DRAFT.pdf" : `Valuation-report-${number}.pdf`, bytes, parts: PARTS_V3, pages: 4 };
}
