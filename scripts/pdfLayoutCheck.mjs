// DESK VALUATIONS: THE REPORT PDF (Lane E, Nov 4 2026; docs/desk-valuations-spec.md "Finalise, PDF, send"). Built server side from a finalised sheet. Ten parts in the spec's order (the note to the seller
// is its own page, between the decision and the photos, only where one is written), the org's logo at the top of the cover, the org as the author and no expert's name anywhere, the footer, the
// methodology line and the org watermark on every page, and no figure on it that the sheet and its frozen read do not carry.   node scripts/pdfLayoutCheck.mjs
import fs from "node:fs";
import { handleSheetAction } from "../lib/desk/sheetActions.js";
import { memoryStore } from "../lib/desk/sheetStore.js";
import { buildReport, PARTS } from "../lib/desk/reportPdf.js";
import { pdfPages } from "../lib/pdf/mini.js";
import { allowedFigures, unexplained } from "./figureScan.mjs";
import { startDesk, seed, wait, press, typeIn } from "./deskValsRender.mjs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const LOGO = "data:image/png;base64," + fs.readFileSync("public/icon-192.png").toString("base64"), JPG = "data:image/jpeg;base64," + fs.readFileSync("public/img/sell/specialist.jpg").toString("base64");
const SEAT = "ava.expert@example.com", ORG = { name: "Hagerty Marketplace", logo: LOGO, monthlyExportCap: 3 };
async function finalised({ org = "pdf-org", note = "Thank you for sending your car. We would list it with a reserve near the middle of this range.", seat = SEAT } = {}) {
  const store = memoryStore(), cx = s => ({ now: "2026-11-04T12:00:00.000Z", env: {}, org, seat: s || seat, store, orgSettings: ORG, send: async () => ({ ok: true }) });
  const sh = await seed(store, { seat, org }); const s0 = await store.get(org, sh.id); s0.submission.photos = [{ id: "p1", name: "front.jpg", url: JPG }, { id: "p2", name: "rear.png", url: LOGO }, { id: "p3", name: "dash.jpg", url: JPG }]; await store.put(org, s0);
  await handleSheetAction("sheet_open", { id: sh.id }, cx());
  await handleSheetAction("sheet_save", { id: sh.id, patch: { tier: 2, photosSelected: ["p1", "p2"], heroId: "p1", pinned: "What did Elevens sell for last month?", checklist: { title: { state: "Seen", line: "Clean" }, modifications: { state: "Seen", choice: "Stock" }, service: { state: "Not supplied", line: "" } }, decision: { mode: "range", low: "67300", high: "70500", reasons: [], otherText: "", line: "", guardLines: {}, note } } }, cx());
  const f = await handleSheetAction("sheet_finalise", { id: sh.id }, cx()); if (!f.ok) throw new Error("finalise: " + f.why);
  return { store, cx, id: sh.id, sheet: await store.get(org, sh.id), org };
}
const T = pages => pages.map(p => p.join(" | "));
const stream = bytes => [...Buffer.from(bytes).toString("latin1").matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(m => m[1]).filter(s => /BT /.test(s));

const A = await finalised(); const rep = await buildReport(A.sheet, ORG, {});
const pages = pdfPages(rep.bytes), txt = T(pages), all = txt.join("\n");
// ---- the ten parts, in the spec's order, with the note page where it is written
const ORDER = [...PARTS.slice(0, 8), "Note to the seller", ...PARTS.slice(8)];
ok(JSON.stringify(rep.parts) === JSON.stringify(ORDER), `the report's parts are the ten in the spec's order, with the note to the seller between the decision and the photos (${rep.parts.join(" > ")})`);
ok(JSON.stringify(rep.coreParts) === JSON.stringify(PARTS) && PARTS.length === 10, "the ten fixed parts are all there");
const heads = pages.map(p => (p.find(x => /^\d\d|^N  /.test(x)) || "").replace(/\s+/g, " ")), firstOf = n => heads.findIndex(h => h.toUpperCase().includes(n.toUpperCase()));
const idx = ORDER.map(firstOf); ok(idx.every((x, i) => x >= 0 && (i === 0 || x > idx[i - 1])), `each part starts a page, in order (pages ${idx.join(", ")})`);
ok(pages.length === rep.pages && rep.pages >= 11, `${rep.pages} pages`);
// the decision part: market range, starting figure, reserve or range given, reasons: in that order
{ const dp = pages[firstOf("Decision")].join("\n"), a = dp.indexOf("MARKET RANGE"), b = dp.indexOf("ENGINE MEDIAN"), c = dp.search(/RANGE GIVEN|RESERVE GIVEN/); ok(a >= 0 && b > a && c > b, "the decision prints the market range, the engine median, then the reserve or range given"); }
ok(/Question for the seller/i.test(all) && /What did Elevens sell for last month\?/.test(all), "a question pinned to the sheet prints on the report");
// the comparables page prints each row exactly as the frozen read carries it, cell by cell, newest first (a small figure that happens to match a date part cannot hide a changed one)
{ const cp = pages[firstOf("Comparables")], at = cp.indexOf("LINK") + 1, rows = A.sheet.read.market.comparables, usd = n => "$" + Math.round(n).toLocaleString("en-US");
  const want = rows.flatMap(c => [c.date, c.venue, usd(c.price), Number(c.mileage).toLocaleString("en-US"), String(c.tier == null ? "-" : c.tier), ...(c.mid ? [c.mid === "median" ? "MEDIAN" : "MIDDLE"] : []), String(c.url).replace(/^https?:\/\//, "").slice(0, 34)]);
  ok(at > 0 && JSON.stringify(cp.slice(at, at + want.length)) === JSON.stringify(want) && rows.every((c, i) => i === 0 || rows[i - 1].date >= c.date), `the comparables print as the read carries them, newest first (${rows.length} rows)`); }
// the note: its own page, only where written
{ const B = await finalised({ org: "pdf-org-2", note: "" }); const r2 = await buildReport(B.sheet, ORG, {}); ok(JSON.stringify(r2.parts) === JSON.stringify(PARTS) && !/Note to the seller/i.test(T(pdfPages(r2.bytes)).join("\n")), "with no note written there is no note page (the ten parts only)"); }
{ const np = pages[firstOf("Note to the seller")].join(" "); ok(/Thank you for sending your car/.test(np) && !/\$\d/.test(np), "the note page is the expert's words, alone on its page, with no figure"); }
// ---- the org is the author: logo at the top, no expert's name anywhere
{ const cs = stream(rep.bytes); ok(/\/Im\d+ Do/.test(cs[0]) && (cs[0].match(/\/Im\d+ Do/g) || []).length >= 2, "the cover carries the org's logo and the hero photo as images"); }
{ const whole = Buffer.from(rep.bytes).toString("latin1"), noInfo = whole.replace(/\/Keywords \([^)]*\)/, ""); ok(!/ava\.expert|Ava Expert|expert@/i.test(noInfo) && !/ava\.expert/i.test(all), "no expert's name or address on any page or anywhere else in the file (the seat is in the keywords as watermark data only)"); ok(/\/Keywords \(report=DV-\d{4}-\d{4}; org=Hagerty Marketplace; seat=ava\.expert@example\.com\)/.test(whole), "the seat is stamped in the file's keywords only"); }
ok(/Prepared by Hagerty Marketplace/.test(txt[0]) && !/Sam\b/.test(txt[0]), "the cover says the org prepared it");
// ---- the footer, the methodology line and the watermark on every page
{ const rn = A.sheet.final.reportNumber, meth = A.sheet.read.coverage.methodology.slice(0, 40), cs = stream(rep.bytes);
  const eachFooter = pages.every((p, i) => { const t = p.join(" "); return t.includes("Hagerty Marketplace") && t.includes("4 November 2026") && t.includes("Report " + rn) && t.includes(meth) && t.includes(`Page ${i + 1} of ${pages.length}`); });
  ok(eachFooter, "every page carries the footer: org, date, report number, methodology line and page of pages");
  ok(cs.length === pages.length && cs.every(s => /\/sansb \d+ Tf [\d.]+ g [\d. -]+ Tm \(HAGERTY MARKETPLACE\) Tj/.test(s)), "every page carries the org's watermark (rotated, light)"); }
// ---- no figure on the report that the sheet does not carry
{ const s = A.sheet, allowed = allowedFigures(s.read, s.final, s.state, s.submission, { pages: Array.from({ length: 30 }, (_, i) => i + 1) }); const bad = unexplained(all.replace(/Page \d+ of \d+/g, ""), allowed); ok(bad.length === 0, `every figure on the report is one the frozen read, the decision or the submission carries (unexplained: ${bad.join(", ") || "none"})`); }
// ---- the sheet must be finalised, and only its owner exports or sends; the monthly cap
{
  const store = memoryStore(), cx = s => ({ now: "2026-11-04T12:00:00.000Z", env: {}, org: "pdf-org-3", seat: s, store, orgSettings: { ...ORG, monthlyExportCap: 2 }, send: async p => ({ ok: true, subject: "S" }) });
  const sh = await seed(store, { org: "pdf-org-3", seat: "ava" }); await handleSheetAction("sheet_open", { id: sh.id }, cx("ava"));
  let r = await handleSheetAction("sheet_pdf", { id: sh.id }, cx("ava")); ok(r.refused && /Finalise the sheet first/.test(r.why), "no PDF before finalise: " + r.why);
  await handleSheetAction("sheet_save", { id: sh.id, patch: { tier: 2, decision: { mode: "reserve", reserve: "68000", reasons: [], otherText: "", line: "", guardLines: {}, note: "" } } }, cx("ava")); await handleSheetAction("sheet_finalise", { id: sh.id }, cx("ava"));
  r = await handleSheetAction("sheet_pdf", { id: sh.id }, cx("ben")); ok(r.refused, "another seat cannot export the sheet: " + r.why);
  r = await handleSheetAction("sheet_pdf", { id: sh.id }, cx("ava")); ok(r.ok && Buffer.from(r.pdf_b64, "base64").slice(0, 5).toString() === "%PDF-" && /^DV-\d{4}-\d{4}\.pdf$/.test(r.filename), "the owner gets the PDF: " + r.filename);
  await handleSheetAction("sheet_pdf", { id: sh.id }, cx("ava")); r = await handleSheetAction("sheet_pdf", { id: sh.id }, cx("ava")); ok(r.refused && /monthly export limit/.test(r.why), "past the org's monthly export cap the export is refused: " + r.why);
}
// ---- Send: consignor pre-filled, the org's message the expert may edit, the note, the PDF attached, sent as the org; Sent with time and address and a copy; a failed send is not Sent; nothing is sent on its own
{
  const sent = [], send = async p => { sent.push(p); return p.to === "bounce@example.com" ? { ok: false, why: "The address was refused." } : { ok: true, subject: "Valuation report " + p.reportNumber, messageId: "m1" }; };
  const D = await startDesk({ org: "pdf-send", seat: "ava", orgSettings: { name: "Hagerty Marketplace", standardMessage: "Thank you for sending your car. The valuation report is attached." }, send });
  const a = await seed(D.store, { org: "pdf-send", seat: "ava" }); const p = await D.open(1440); await press(p, `[data-open="${a.id}"]`); await wait(800); await press(p, '[data-tier="2"]'); await wait(600);
  await press(p, '[data-dmode="reserve"]'); await wait(400); await typeIn(p, '[data-k="d-reserve"]', "68000"); await typeIn(p, '[data-k="d-note"]', "A note for the seller."); await wait(1000);
  ok(sent.length === 0, "nothing is sent on its own: automatic sending is off");
  await press(p, "[data-finalise]"); await wait(900); ok(sent.length === 0, "finalising does not send");
  const panel = await p.evaluate(() => ({ to: document.querySelector('[data-k="send-to"]').value, msg: document.querySelector('[data-k="send-msg"]').value, text: document.querySelector(".send").innerText }));
  ok(panel.to === "seller@example.com" && /The valuation report is attached/.test(panel.msg) && /A note for the seller/.test(panel.text) && /Attached: DV-\d{4}-\d{4}\.pdf/.test(panel.text), "the Send panel: the consignor's address pre-filled, the org's message, the note, the PDF named as attached");
  await p.$eval('[data-k="send-msg"]', e => { e.value = "Edited by the expert."; e.dispatchEvent(new Event("input", { bubbles: true })); });
  await p.$eval('[data-k="send-to"]', e => { e.value = "bounce@example.com"; e.dispatchEvent(new Event("input", { bubbles: true })); });
  await p.click("[data-send]"); await wait(900);
  ok(sent.length === 1 && /refused/.test(await p.evaluate(() => document.querySelector(".send").innerText)) && !/Sent/.test(await p.evaluate(() => document.querySelector(".chips").innerText)), "a send that fails prints the service's reason and the sheet is not Sent");
  await p.$eval('[data-k="send-to"]', e => { e.value = "seller@example.com"; e.dispatchEvent(new Event("input", { bubbles: true })); });
  await p.click("[data-send]"); await wait(1000);
  ok(sent.length === 2 && sent[1].message === "Edited by the expert." && sent[1].note === "A note for the seller." && Buffer.from(sent[1].pdf_b64, "base64").slice(0, 5).toString() === "%PDF-" && sent[1].org === "Hagerty Marketplace", "the send carries the edited message, the note, the PDF and the org");
  const after = await p.evaluate(() => ({ chips: document.querySelector(".chips").innerText, box: (document.querySelector(".sentbox") || {}).innerText })); ok(/Sent/i.test(after.chips) && /seller@example\.com/.test(after.box) && /Edited by the expert\./.test(after.box), "the sheet moves to Sent with the address and a copy of what went out");
  const row = (await D.store.get("pdf-send", a.id)); ok(row.status === "Sent" && row.sent.to === "seller@example.com" && row.sent.at && row.sent.copy.message === "Edited by the expert.", "the Sent time, address and copy are kept on the sheet");
  ok(p._errs.length === 0, "no page error"); await D.close();
}
console.log(`pdfLayoutCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
