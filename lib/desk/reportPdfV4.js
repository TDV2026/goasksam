// THE SELLER REPORT, EDITION 4 (Lane D, Nov 15 2026; redesign order 2318 item 4). Behind the org setting report.version 4 (default 3: lib/desk/reportBuild.js). Three pages, premium editorial: serif headings, the org's logo, no internal notes.
//   page 1  "Your car. Our recommendation.": the cover photo, the car and its specification, the seller's name, the mileage, the assessment date, what cars like this sold for (the engine's typical range), our recommended reserve (or no reserve) with its one line reason, the analyst's why, the condition line
//   page 2  "The evidence behind our recommendation": a summary strip of the market read, a compact chart of the sales, the ticked sales with photo, price paid, mileage, venue, date, why it was chosen and the listing link; the car's own earlier sale on its own line
//   page 3  "Your selling strategy": how the reserve was set, the other reserves the seller may prefer, what we took into account, the documents received, the next steps, the org's contact line and a short disclaimer
// A fourth page exists only when a page's content genuinely overflows (the same running head, never shrunk text). Every sentence and figure is rs.ed (lib/desk/reportState.js): this file places them and computes nothing. No likely result, no assessed range, no median and no stage band is printed; every price is what the buyer paid, and the page says so.
// Nothing prints below 9 pt. The paper is the org's (Letter by default, A4). DRAFT is a watermark on a preview only.
import { Doc } from "../pdf/mini.js";
import { reportFonts } from "../pdf/fonts.js";
import { accentOf, loadImage } from "./reportPdf.js";
import { reportState, longDate } from "./reportState.js";
import { coverIdOf } from "./coverPhoto.js";
import { PAPERS } from "./reportPdfV3.js";
import { moneyWords, reasonLine } from "../reasonWords.js";

export const PARTS_V4 = ["Your car", "The evidence", "Your selling strategy"];
const INK = [0.1, 0.08, 0.06], SLATE = [0.4, 0.37, 0.32], FAINT = [0.57, 0.54, 0.48], LINE = [0.85, 0.82, 0.76], PALE = [0.96, 0.95, 0.92], WHITE = [1, 1, 1];
const M = 48, TOP = 78;

export async function buildReportV4(sheet, org, { fetchImage, readPhoto, draft = false, onlyPage } = {}) {
  const [W, H] = PAPERS[String(org.paper || "").toLowerCase() === "a4" ? "a4" : "letter"], FOOT = H - 52, CW = W - 2 * M;
  const c = sheet.case, rs = reportState(c), E = rs.ed, fin = sheet.final || {}, ACC = accentOf((fin.org && fin.org.color) || org.color);
  const orgName = (fin.org && fin.org.name) || org.name, logo = org.logo || (fin.org && fin.org.logo), number = draft ? null : fin.reportNumber || null;
  const when = longDate(draft ? new Date().toISOString() : c.finalized_at || fin.finalisedAt), car = [rs.identification.year, rs.identification.make, rs.identification.model, rs.identification.trim].filter(Boolean).join(" ");
  const doc = new Doc({ embed: reportFonts(), w: W, h: H, title: draft ? reasonLine("report.title_draft") : reasonLine("report.title_final", { number: number || "" }).trim(), author: orgName, subject: car || reasonLine("report.name"), keywords: draft ? `draft; org=${orgName}` : `report=${number}; version=${c.version}; org=${orgName}; edition=4` });
  // NOTHING PRINTS BELOW 9 PT: one floor at the source, so no text run, measure or wrap can use a smaller size, whatever size a line asks for
  const MINPT = 9, _text = doc.text.bind(doc), _measure = doc.measure.bind(doc), _wrap = doc.wrap.bind(doc);
  doc.text = (x, y, s, o = {}) => _text(x, y, s, { ...o, size: Math.max(MINPT, o.size || 10) });
  doc.measure = (s, size, font) => _measure(s, Math.max(MINPT, size || 10), font);
  doc.wrap = (s, size, font, w) => _wrap(s, Math.max(MINPT, size || 10), font, w);
  const T = (s, x, y, o) => doc.text(x, y, s, o);
  const right = (s, xr, y, o) => doc.text(xr - doc.measure(s, o.size || 10, o.font || "serif"), y, s, o);
  const para = (s, x, y, w, o = {}) => { const size = Math.max(MINPT, o.size || 10.5), lh = o.lh || size + 4.5, lines = doc.wrap(String(s), size, o.font || "serif", w); let yy = y; for (const l of lines.slice(0, o.max || 99)) { T(l, x, yy + size, { font: o.font || "serif", size, color: o.color || INK }); yy += lh; } return yy; };
  const eyebrow = (s, x, y, o = {}) => T(String(s).toUpperCase(), x, y + 9, { font: "sansb", size: MINPT, color: o.color || FAINT });
  const heading = (s, y0, size = 24) => { const lines = doc.wrap(String(s), size, "serifb", CW); let yy = y0; for (const l of lines) { T(l, M, yy + size, { font: "serifb", size, color: INK }); yy += size + 5; } doc.rule(M, yy + 7, M + 46, { color: ACC, width: 2.2 }); return yy + 22; };
  const sub = (s, x, y, w) => { T(s, x, y + 14, { font: "serifb", size: 14, color: INK }); doc.rule(x, y + 21, x + w, { color: LINE, width: 0.8 }); return y + 30; };
  // EVERY PICTURE IS FETCHED AT ONCE, EACH ONCE
  const imgs = new Map(), get = url => { if (!url) return Promise.resolve(null); if (!imgs.has(url)) imgs.set(url, loadImage(url, fetchImage)); return imgs.get(url); };
  const subPhotos = (sheet.submission && sheet.submission.photos) || [], coverId = coverIdOf(c, subPhotos), hero = subPhotos.find(p => String(p.id) === coverId);
  // THE CAR'S OWN PHOTOS ARE PRIVATE STORAGE OBJECTS (Lane C's live run on the Ferrari, Nov 15 2026: page one had no cover photo): they are read through the storage client with the service key (readPhoto(path)), never fetched as if they were public listing URLs; a listing photo of a sale is a public URL and is fetched as one
  const photoBytes = async p => { if (!p) return null; if (p.path && readPhoto) { try { const b = await readPhoto(p.path); if (b && b.length) return b; } catch { /* falls through to the address, if the photo has one */ } } return p.url ? get(p.url) : null; };
  for (const u of [logo, ...E.p2.sales.map(s => s.photo)]) get(u);
  const logoBytes = logo ? await get(logo) : null;
  const head = async () => {
    if (logoBytes && doc.image(logoBytes, M, 28, 96, 20)) {} else { const w = doc.measure(orgName.toUpperCase(), 9, "sansb") + 22; doc.rect(M, 28, w, 20, { fill: WHITE, stroke: INK }); T(orgName.toUpperCase(), M + 11, 41, { font: "sansb", size: 9, color: INK }); }
    if (E.p3.reference) right(E.p3.reference, W - M, 42, { font: "sans", size: MINPT, color: FAINT });
  };
  const foot = (n, total) => { doc.rule(M, FOOT, W - M, { color: LINE }); T([`Prepared by ${orgName}`, number, when, draft ? "Draft preview" : `Version ${c.version}`].filter(Boolean).join("   "), M, FOOT + 16, { font: "sans", size: MINPT, color: FAINT }); right(`Page ${n} of ${total}`, W - M, FOOT + 16, { font: "sans", size: MINPT, color: FAINT }); if (draft) doc.watermark("DRAFT"); };
  const footPages = [], donePage = () => { footPages.push(doc.pages.length - 1); };
  let y = TOP;
  const cont = async () => { donePage(); doc.newPage(); await head(); y = TOP; };
  const room = async h => { if (y + h > FOOT - 10) await cont(); };
  const flow = async (s, o = {}, x = M, w = CW) => { const size = Math.max(MINPT, o.size || 10.5), lh = o.lh || size + 4.5, font = o.font || "serif"; for (const l of doc.wrap(String(s), size, font, w)) { await room(lh); T(l, x, y + size, { font, size, color: o.color || INK }); y += lh; } y += o.after == null ? 6 : o.after; };

  // ---------- PAGE 1: your car, our recommendation (Sam's order, Nov 15 2026): the cover photo full width at the top (16 by 9), the car, the one large figure with the seller's sentence and the analyst's why, the condition in the seller's words. No market range here and no desk wording.
  await head(); y = TOP;
  { const p = E.p1, hb = hero ? await photoBytes(hero) : null;
    if (hb) { const ph = Math.round(CW * 9 / 16); doc.imageCover(hb, M, y, CW, ph); y += ph + 16; }   // no cover photo, no picture and no placeholder
    T(p.heading, M, y + 15, { font: "serifb", size: 15, color: ACC }); y += 24;
    for (const l of doc.wrap(p.title || "Vehicle", 20, "serifb", CW).slice(0, 2)) { T(l, M, y + 20, { font: "serifb", size: 20, color: INK }); y += 25; }
    if (p.specLine) y = para(p.specLine, M, y + 2, CW, { font: "sans", size: 10, color: SLATE, max: 3 });
    if (p.identifier) y = para(p.identifier, M, y + 2, CW, { font: "sans", size: 10, color: SLATE, max: 1 });   // the VIN or the chassis the seller gave, as the case shows it
    { const line1 = [p.seller, p.assessed].filter(Boolean).join("  \u00b7  "); if (line1) y = para(line1, M, y + 2, CW, { font: "sans", size: 10, color: SLATE, max: 2 }); }
    y += 10; doc.rule(M, y, W - M, { color: LINE }); y += 14;
    eyebrow(p.reserve.label, M, y); y += 16;
    { const size = doc.measure(p.reserve.figureText, 40, "serifb") > CW ? 28 : 40; T(p.reserve.figureText, M, y + size, { font: "serifb", size, color: ACC }); y += size + 12; }
    if (p.reserve.clearedLine) y = para(p.reserve.clearedLine, M, y, CW, { font: "sansb", size: 11, color: INK, max: 3 }) + 4;
    if (p.reserve.note) await flow(p.reserve.note, { size: 10, color: SLATE });
    if (p.why) { y += 6; await room(60); for (const l of doc.wrap(String(p.why), 12, "serif", CW - 16)) { await room(18); doc.line(M + 3, y + 1, M + 3, y + 16, { color: ACC, width: 2 }); T(l, M + 14, y + 12, { font: "serif", size: 12, color: INK }); y += 18; } y += 6; }
    if (p.conditionLine) await flow(p.conditionLine, { size: 10.5, color: SLATE, after: p.conditionNote ? 2 : 6 });
    if (p.conditionNote) await flow(p.conditionNote, { size: 10.5, color: SLATE });
  }
  donePage();

  // ---------- PAGE 2: the evidence behind our recommendation: the range strip first, "every price is what the buyer paid" once under it, the chart, then the ticked sales (cards flow so no page holds one sale alone)
  doc.newPage(); await head(); y = TOP;
  { const p = E.p2; y = heading(p.heading, y, 22);
    if (p.summary.length) {
      const h = 50, cellW = CW / p.summary.length; doc.rect(M, y, CW, h, { fill: PALE });
      p.summary.forEach((cell, i) => { const cx = M + i * cellW + 12; if (cell.emphasis) doc.rect(M + i * cellW, y, cellW, h, { fill: [0.86, 0.91, 0.88] }); eyebrow(cell.label, cx, y + 8); const vs = doc.measure(cell.value, 13, "serifb") > cellW - 20 ? 10 : 13; T(cell.value, cx, y + 40, { font: "serifb", size: vs, color: cell.emphasis ? ACC : INK }); });
      y += h + 8;
    } else if (p.insufficientLine) y = para(p.insufficientLine, M, y, CW, { size: 11, color: SLATE }) + 8;
    y = para(p.priceNote, M, y, CW, { font: "sansb", size: 9.5, color: INK }) + 8;   // once, for every card below
    if (p.chart) {
      const ch = p.chart, sx = M + 4, sw = CW - 8, X = q => sx + (q / 100) * sw, cy = y + 18;
      doc.rect(sx, cy - 6, sw, 12, { fill: PALE }); doc.rect(X(ch.q1Pct), cy - 6, X(ch.q3Pct) - X(ch.q1Pct), 12, { fill: [0.82, 0.88, 0.84] });
      for (const d of ch.dots) doc.circle(X(d.pct), cy - 13, 2.6, { fill: [0.5, 0.58, 0.54] });
      if (ch.reservePct != null) doc.line(X(ch.reservePct), cy - 20, X(ch.reservePct), cy + 18, { color: ACC, width: 1.6, dash: [2, 2] });
      if (ch.lowLabel) T(ch.lowLabel, sx, cy + 32, { font: "sans", size: MINPT, color: SLATE });
      if (ch.highLabel) { const w = doc.measure(ch.highLabel, MINPT, "sans"); T(ch.highLabel, sx + sw - w, cy + 32, { font: "sans", size: MINPT, color: SLATE }); }
      if (ch.reserveLabel && ch.reservePct != null) { const w = doc.measure(ch.reserveLabel, MINPT, "sansb"); T(ch.reserveLabel, Math.min(Math.max(X(ch.reservePct) - w / 2, sx), sx + sw - w), cy + 32, { font: "sansb", size: MINPT, color: ACC }); }
      y = cy + 40; y = para(ch.caption, M, y, CW, { font: "sans", size: MINPT, color: SLATE }) + 6;
    }
    const ph = await Promise.all(p.sales.map(s => (s.photo ? get(s.photo) : null))), RH = 94, IW = 128, IH = 84, n = p.sales.length;
    // HOW MANY CARDS GO ON EACH PAGE: as many as fit; no page holds one sale alone (a last page of one takes one card from the page before; a first page that could hold one starts the cards on the next)
    const cap1 = Math.max(0, Math.floor((FOOT - 10 - y) / RH)), capN = Math.max(1, Math.floor((FOOT - 10 - TOP) / RH)), counts = []; { let left = n, first = cap1 >= 2 || n < 2 ? Math.min(n, cap1) : 0; if (first) { counts.push(first); left -= first; } else counts.push(0); while (left > 0) { const k = Math.min(left, capN); counts.push(k); left -= k; }
      const last = counts.length - 1; if (last > 0 && counts[last] === 1 && counts[last - 1] >= 2 && n >= 2) { counts[last - 1] -= 1; counts[last] += 1; } }
    let idx = 0;
    for (let pg = 0; pg < counts.length; pg++) {
      if (pg > 0) await cont();
      for (let k = 0; k < counts[pg]; k++, idx++) {
        const s = p.sales[idx], yy = y;
        if (ph[idx] && doc.imageCover(ph[idx], M, yy, IW, IH)) {} else { doc.rect(M, yy, IW, IH, { fill: [0.87, 0.92, 0.89] }); const ls = doc.wrap(p.noPhotoLine, 9, "serif", IW - 16); let ly = yy + IH / 2 - ls.length * 6; for (const l of ls) { T(l, M + IW / 2 - doc.measure(l, 9, "serif") / 2, ly + 9, { font: "serif", size: 9, color: SLATE }); ly += 12; } }
        const tx = M + IW + 16, tw = CW - IW - 16; T(moneyWords(s.price), tx, yy + 20, { font: "serifb", size: 20, color: INK });
        let ty = para([s.title, s.milesWords].filter(Boolean).join("  \u00b7  "), tx, yy + 28, tw, { font: "sansb", size: 9.5, max: 2 });
        ty = para([s.venue, s.monthYear].filter(Boolean).join("  \u00b7  "), tx, ty, tw, { font: "sans", size: 9.5, color: SLATE, max: 1 });
        if (s.whyLine) para(s.whyLine, tx, ty, tw, { size: 9.5, color: SLATE, max: 2 });
        if (s.url) { T(p.viewListing, tx, yy + IH - 2, { font: "sans", size: MINPT, color: ACC }); doc.link(tx, yy + IH - 12, 140, 14, s.url); }
        y += RH; doc.rule(M, y - 5, W - M, { color: LINE, width: 0.6 });
      }
    }
    if (p.own) { await room(54); y += 6; eyebrow(p.own.heading, M, y); y += 16; await flow(p.own.line, { size: 10.5, color: INK }); }
  }
  donePage();

  // ---------- PAGE 3: your selling strategy
  doc.newPage(); await head(); y = TOP;
  { const p = E.p3; y = heading(p.heading, y, 24);
    await room(60); y = sub(p.reserveHeading, M, y, CW);
    if (p.reachedLine) await flow(p.reachedLine, { size: 11, color: INK });
    for (const l of p.extraRungs) await flow(l, { size: 10.5, color: SLATE });
    if (p.considered.length) {
      y += 6; await room(60); y = sub(p.consideredHeading, M, y, CW);
      for (const it of p.considered) { const lines = doc.wrap(String(it.text), 10, "serif", CW); await room((it.label ? 14 : 0) + Math.min(lines.length, 3) * 14.5 + 8); if (it.label) { T(it.label, M, y + 10, { font: "sansb", size: 9.5, color: INK }); y += 14; } await flow(it.text, { size: 10, color: INK, after: 4 }); }
    }
    if (p.documents.length) { y += 6; await room(40 + p.documents.length * 14); y = sub(p.documentsHeading, M, y, CW); for (const d of p.documents) { await room(16); y = para(d, M, y, CW, { size: 10, lh: 14, color: INK, max: 2 }); } }
    y += 6; await room(60); y = sub(p.nextHeading, M, y, CW);
    for (let i = 0; i < p.nextSteps.length; i++) { const l = p.nextSteps[i]; await room(doc.wrap(l, 11.5, "serif", CW - 26).length * 16 + 8); T(`${i + 1}`, M, y + 15, { font: "serifb", size: 15, color: ACC }); const y0 = y; y = para(l, M + 26, y, CW - 26, { size: 11.5, lh: 16, max: 60 }) + 6; void y0; }
    // the org's contact line, its address, phone and email, and the short disclaimer: always together, never split across pages
    const contact = [org.contactAddress, org.contactPhone, org.contactEmail].filter(Boolean), need = 34 + contact.length * 13 + doc.wrap(p.disclaimer, 9, "serif", CW).length * 13;
    y += 8; await room(need); doc.rule(M, y, W - M, { color: LINE }); y += 8;
    T(reasonLine("ed.contact", { org: orgName }), M, y + 10, { font: "sansb", size: 9.5, color: INK }); y += 18; for (const l of contact) y = para(l, M, y, CW, { font: "sans", size: 9, lh: 13, color: SLATE });
    y = para(p.disclaimer, M, y + 4, CW, { font: "serif", size: 9, lh: 13, color: SLATE });
  }
  donePage();
  for (let i = 0; i < footPages.length; i++) { doc.cur = doc.pages[footPages[i]]; foot(i + 1, footPages.length); }   // "Page x of y", once the number of pages is known

  const bytes = doc.build(onlyPage);
  return { filename: draft ? "Valuation-report-DRAFT.pdf" : `Valuation-report-${number}.pdf`, bytes, parts: PARTS_V4, pages: doc.pages.length, edition: 4 };
}
