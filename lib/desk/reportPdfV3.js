// DESK V3 STAGE 4: THE REPORT, FOUR PAGES (Lane D, Nov 8 2026). Built from the case (lib/desk/reportState.js is every sentence and figure; this file only places them). Nothing is computed here and nothing is typed that the case did not say.
//   page 1  cover photo (the seller's cover image; a typographic cover when the case has none, never a placeholder), identification, the two figures, the short explanation
//   page 2  the dot strip of every completed sale with the engine's median, the assessed range and the reserve marked; strengths and considerations in two columns; the condition box
//   page 3  the selected comparables (four at most): photo, price, miles, venue, date, one why sentence, a clickable source link; a sale with no photo gets a text card
//   page 4  the quarterly medians that are shown, live listings (bid, ask or not sold), next steps, the note, contact and version
// A section with nothing to say is left out, not printed empty. DRAFT is a watermark on a preview only; a finalized version carries none. Every page: org, report number, date, version, "Page n of 4".
import { Doc } from "../pdf/mini.js";
import { reportFonts } from "../pdf/fonts.js";
import { accentOf, loadImage } from "./reportPdf.js";
import { reportState, longDate } from "./reportState.js";
import { coverOf } from "./sheetShape.js";
import { moneyWords } from "../reasonWords.js";
import { countNoun } from "../countNoun.js";

export const PARTS_V3 = ["Cover", "The market", "Comparables", "Next steps"];
const INK = [0.1, 0.08, 0.06], SLATE = [0.4, 0.37, 0.32], FAINT = [0.57, 0.54, 0.48], LINE = [0.85, 0.82, 0.76], PALE = [0.96, 0.95, 0.92];
// PAPER (Sam, Nov 9 2026): an org setting, Letter by default and A4 when the org row says so (desk_orgs.settings.paper).
export const PAPERS = { letter: [612, 792], a4: [595, 842] };
const M = 54, TOP = 70;

export async function buildReportV3(sheet, org, { fetchImage, draft = false, onlyPage } = {}) {
  const [W, H] = PAPERS[String(org.paper || "").toLowerCase() === "a4" ? "a4" : "letter"], FOOT = H - 52;
  const c = sheet.case, rs = reportState(c), fin = sheet.final || {}, ACC = accentOf((fin.org && fin.org.color) || org.color);
  const orgName = (fin.org && fin.org.name) || org.name, logo = org.logo || (fin.org && fin.org.logo), number = draft ? null : fin.reportNumber || null;
  const when = longDate(draft ? new Date().toISOString() : c.finalized_at || fin.finalisedAt), car = [rs.identification.year, rs.identification.make, rs.identification.model, rs.identification.trim].filter(Boolean).join(" ");
  const doc = new Doc({ embed: reportFonts(), w: W, h: H, title: draft ? "Valuation report DRAFT" : `Valuation report ${number || ""}`.trim(), author: orgName, subject: car || "Valuation report", keywords: draft ? `draft; org=${orgName}` : `report=${number}; version=${c.version}; org=${orgName}` });
  const T = (s, x, y, o) => doc.text(x, y, s, o);
  const para = (s, x, y, w, o = {}) => { const size = o.size || 10.5, lh = o.lh || size + 4, lines = doc.wrap(String(s), size, o.font || "serif", w); let yy = y; for (const l of lines.slice(0, o.max || 99)) { T(l, x, yy + size, { font: o.font || "serif", size, color: o.color || INK }); yy += lh; } return yy; };
  const head = (n, name) => { if (n > 1) doc.newPage(); T(`${String(n).padStart(2, "0")}  ${name.toUpperCase()}`, M, 44, { font: "mono", size: 8.5, color: FAINT }); doc.rule(M, 52, W - M, { color: LINE }); };
  const label = (s, x, y) => T(String(s).toUpperCase(), x, y + 8, { font: "mono", size: 7.5, color: FAINT });
  const pages = []; const foot = (n) => { doc.rule(M, FOOT, W - M, { color: LINE }); T([`Prepared by ${orgName}`, number, when, draft ? "Draft preview" : `Version ${c.version}`].filter(Boolean).join("   "), M, FOOT + 16, { font: "mono", size: 7.5, color: FAINT }); T(`Page ${n} of 4`, W - M - 52, FOOT + 16, { font: "mono", size: 7.5, color: FAINT }); if (draft) doc.watermark("DRAFT"); };

  // 1 cover
  head(1, PARTS_V3[0]);
  let y = TOP;
  if (logo) { const b = await loadImage(logo, fetchImage); if (b && doc.image(b, M, y - 6, 150, 40)) {} else T(orgName, M, y + 20, { font: "serifb", size: 16 }); } else T(orgName, M, y + 20, { font: "serifb", size: 16 });
  y += 52; T(draft ? "DRAFT FOR REVIEW, NOT A REPORT" : "VALUATION REPORT", M, y, { font: "mono", size: 8.5, color: draft ? ACC : FAINT }); y += 22;
  const hero = (sheet.submission.photos || []).find(p => p.id === (c.photos.coverId || coverOf(sheet.submission, sheet.state || {}))), heroBytes = hero ? await loadImage(hero.url, fetchImage) : null;
  if (heroBytes && doc.image(heroBytes, M, y, W - 2 * M, 250)) { y += 262; }
  else { doc.rect(M, y, W - 2 * M, 4, { fill: ACC }); y += 24; }   // the typographic cover: the name set large, no picture and no placeholder
  for (const l of doc.wrap(car || "Vehicle", heroBytes ? 24 : 34, "serifb", W - 2 * M).slice(0, 3)) { T(l, M, y + (heroBytes ? 24 : 34), { font: "serifb", size: heroBytes ? 24 : 34, color: INK }); y += heroBytes ? 30 : 42; }
  y += 6; const idBits = [rs.identification.vin, rs.mileageWords, rs.identification.transmission, rs.identification.colour].filter(Boolean).join("   "); if (idBits) { T(idBits, M, y + 10, { font: "mono", size: 9.5, color: SLATE }); y += 26; }
  y += heroBytes ? 14 : 40;
  const bw = (W - 2 * M - 16) / 2;
  doc.rect(M, y, bw, 78, { fill: PALE }); label("Likely selling price range", M + 14, y + 12); T(c.assessment.low != null ? `${moneyWords(c.assessment.low)} to ${moneyWords(c.assessment.high)}` : "Not set", M + 14, y + 52, { font: "serifb", size: 20, color: ACC });
  doc.rect(M + bw + 16, y, bw, 78, { fill: PALE }); label("Recommended reserve", M + bw + 30, y + 12); T(c.reserve.figure != null ? moneyWords(c.reserve.figure) : "Not set", M + bw + 30, y + 52, { font: "serifb", size: 20, color: ACC });
  y += 94;
  if (rs.explanation) y = para(rs.explanation, M, y, W - 2 * M, { size: 10.5, max: 6 });
  foot(1);

  // 2 the market
  head(2, PARTS_V3[1]); y = TOP; label("Completed sales of this car", M, y); y += 18;
  if (rs.strip) {
    const sx = M + 6, sw = W - 2 * M - 12, X = p => sx + (p / 100) * sw, cy = y + 52;
    doc.rule(sx, cy, sx + sw, { color: LINE, width: 1 });
    doc.rect(X(rs.strip.q1Pct), cy - 14, X(rs.strip.q3Pct) - X(rs.strip.q1Pct), 28, { fill: PALE });
    for (const d of rs.strip.dots) doc.circle(X(d.pct), cy, 3.2, { fill: SLATE });
    doc.line(X(rs.strip.medianPct), cy - 22, X(rs.strip.medianPct), cy + 22, { color: INK, width: 1.4 }); T(`Median ${moneyWords(rs.strip.median)}`, Math.min(X(rs.strip.medianPct) - 30, W - M - 100), cy - 28, { font: "mono", size: 8, color: INK });
    if (rs.strip.assessLowPct != null) { doc.rect(X(rs.strip.assessLowPct), cy + 30, Math.max(2, X(rs.strip.assessHighPct) - X(rs.strip.assessLowPct)), 6, { fill: ACC }); T(`Assessed range ${moneyWords(rs.strip.assessLow)} to ${moneyWords(rs.strip.assessHigh)}`, X(rs.strip.assessLowPct), cy + 50, { font: "mono", size: 8, color: ACC }); }
    if (rs.strip.reservePct != null) { doc.line(X(rs.strip.reservePct), cy - 22, X(rs.strip.reservePct), cy + 22, { color: ACC, width: 1.4 }); T(`Reserve ${moneyWords(rs.strip.reserve)}`, Math.min(X(rs.strip.reservePct) - 24, W - M - 80), cy + 66, { font: "mono", size: 8, color: ACC }); }
    T(moneyWords(rs.strip.axisMin), sx, cy + 84, { font: "mono", size: 7.5, color: FAINT }); T(moneyWords(rs.strip.axisMax), sx + sw - 44, cy + 84, { font: "mono", size: 7.5, color: FAINT });
    y = cy + 100;
    for (const l of [rs.populationLine, rs.typicalLine, rs.reservePositionLine, rs.differenceLine].filter(Boolean)) y = para(l, M, y, W - 2 * M, { size: 10 });
  } else if (rs.insufficientLine) y = para(rs.insufficientLine, M, y, W - 2 * M);
  y += 12;
  const colW = (W - 2 * M - 24) / 2;
  if (rs.strengths.length || rs.considerations.length) {
    label("Strengths", M, y); label("Considerations", M + colW + 24, y); let ya = y + 16, yb = y + 16;
    for (const l of rs.strengths.slice(0, 6)) ya = para(l, M, ya, colW, { size: 9.5, max: 4 }) + 4;
    for (const l of rs.considerations.slice(0, 6)) yb = para(l, M + colW + 24, yb, colW, { size: 9.5, max: 4 }) + 4;
    y = Math.max(ya, yb) + 10;
  }
  if (rs.conditionLine || rs.conditionBasis) {
    const lines = [rs.conditionLine, rs.conditionBasis].filter(Boolean), h = 22 + lines.reduce((t, l) => t + Math.min(4, doc.wrap(l, 9.5, "serif", W - 2 * M - 28).length) * 13.5 + 4, 0);
    doc.rect(M, y, W - 2 * M, h, { fill: PALE }); label("Condition", M + 14, y + 8); let yy = y + 26; for (const l of lines) yy = para(l, M + 14, yy - 4, W - 2 * M - 28, { size: 9.5, max: 4 }) + 4; y += h + 8;
  }
  foot(2);

  // 3 comparables
  head(3, PARTS_V3[2]); y = TOP; label("Comparable sales", M, y); y += 20;
  const cw = (W - 2 * M - 20) / 2, photos = await Promise.all(rs.comparables.map(cm => (cm.photo ? loadImage(cm.photo, fetchImage) : null))), rowH = r => Math.max(...rs.comparables.map((_, j) => (Math.floor(j / 2) === r ? (photos[j] ? 300 : 190) : 0)));
  for (let i = 0; i < rs.comparables.length; i++) {
    const cm = rs.comparables[i], x = M + (i % 2) * (cw + 20), row = Math.floor(i / 2), ch = rowH(row), yy = y + (row ? rowH(0) + 16 : 0);
    doc.rect(x, yy, cw, ch, { fill: [1, 1, 1], stroke: LINE });
    const pb = photos[i];
    let ty = yy + 12;
    if (pb && doc.image(pb, x + 1, yy + 1, cw - 2, 150)) ty = yy + 160;
    else { doc.rect(x + 1, yy + 1, cw - 2, 6, { fill: ACC }); ty = yy + 24; }   // a sale with no photo is a text card: no picture and no placeholder
    ty = para(cm.title || "", x + 12, ty, cw - 24, { font: "serifb", size: 11, max: 2 });
    T(cm.price != null ? moneyWords(cm.price) : "", x + 12, ty + 22, { font: "serifb", size: 19, color: ACC }); ty += 32;
    for (const l of [cm.milesWords, cm.venue, cm.dateWords].filter(Boolean)) { T(l, x + 12, ty + 10, { font: "mono", size: 8.5, color: SLATE }); ty += 14; }
    if (cm.why) ty = para(cm.why, x + 12, ty + 4, cw - 24, { size: 9.5, max: 3 });
    if (cm.url) { T("View the listing", x + 12, yy + ch - 14, { font: "mono", size: 8.5, color: ACC }); doc.link(x + 12, yy + ch - 26, 90, 14, cm.url); }
  }
  foot(3);

  // 4 next steps
  head(4, PARTS_V3[3]); y = TOP;
  if (rs.quarterLines.length) { label("Median by quarter", M, y); y += 16; for (const l of rs.quarterLines) y = para(l, M, y, W - 2 * M, { size: 10 }); y += 10; }
  if (rs.liveLines.length) { label("Listed now, not completed sales", M, y); y += 16; for (let i = 0; i < rs.liveLines.length; i++) { y = para(rs.liveLines[i], M, y, W - 2 * M, { size: 10, max: 3 }); if (rs.liveLinks[i]) doc.link(M, y - 14, 120, 14, rs.liveLinks[i]); } y += 10; }
  label("Next steps", M, y); y += 16; for (const l of rs.nextSteps) y = para(l, M, y, W - 2 * M, { size: 10.5 }); y += 10;
  if (rs.noteLines.length) { label("Note", M, y); y += 16; for (const l of rs.noteLines) y = para(l, M, y, W - 2 * M, { size: 10 }); y += 10; }
  // CONTACT: the org's own details from its row (desk_orgs.settings contactAddress, contactPhone, contactEmail); no analyst name anywhere in the report (the Desk rule)
  label("Contact", M, y); y += 16; for (const l of [orgName, org.contactAddress, org.contactPhone, org.contactEmail].filter(Boolean)) y = para(l, M, y, W - 2 * M, { size: 10.5 }); y += 10;
  label("Version", M, y); y += 16; para(`${draft ? "Draft of version" : "Version"} ${c.version}${number ? ", report " + number : ""}${when ? ", " + when : ""}.`, M, y, W - 2 * M, { size: 10.5 });
  foot(4);

  const bytes = doc.build(onlyPage);
  return { filename: draft ? "Valuation-report-DRAFT.pdf" : `Valuation-report-${number}.pdf`, bytes, parts: PARTS_V3, pages: 4 };
}
