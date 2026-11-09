// Desk v3 stage 4: the four page report. node scripts/deskPdfCheck.mjs [rootDir]
import path from "node:path"; import fs from "node:fs"; import { pathToFileURL } from "node:url"; import { setup } from "./_deskCaseWorld.mjs";
const root = path.resolve(process.argv[2] || "."), { M, K, readyCase, T } = await setup(root), imp = f => import(pathToFileURL(path.join(root, f)).href);
const P = await imp("lib/desk/reportPdfV3.js"), R = await imp("lib/desk/reportState.js"), mini = await imp("lib/pdf/mini.js"), A = await imp("lib/desk/sheetActions.js"), { memoryStore } = await imp("lib/desk/sheetStore.js");
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? "  " + d : "")); } }; const cl = x => structuredClone(x);
const PNG = fs.readFileSync(path.join(root, "public/icon-512.png"));   // a real picture: the check never needs a placeholder
const fetchImage = async u => (/real\.example/.test(String(u)) ? PNG : null);
const base = await readyCase();
// the demonstration case: four comparables selected, two of them with a photo, a real cover
const pool = base.desk.comparables.filter(x => x.inPopulation).slice(0, 4).map((x, i) => ({ ...x, photo: i < 2 ? "https://real.example/" + i + ".jpg" : null, url: "https://example.com/sale/" + i }));
let demo = cl(base); demo.desk.comparables = [...pool, ...base.desk.comparables.filter(x => !pool.some(p => p.id === x.id))]; demo = K.setReserve(K.selectComparables(demo, pool.map(x => x.id), T), { figure: base.desk.evidence.q1 + 300 }, T);   // a reserve that is not the low of the range, so the two boxes cannot be confused
demo.desk.live = [{ title: "1999 Porsche 911 Carrera", platform: "Bring a Trailer", type: "bid", figure: 36000, ends: "2026-11-12T18:00:00Z", url: "https://example.com/live1" }, { title: "1999 Porsche 911 C2", platform: "Hemmings", type: "ask", figure: 41000, ends: null, url: null }, { title: "1999 Porsche 911", platform: "Cars & Bids", type: "no_sale", figure: null, ends: null, url: null }];
const sheetOf = (c, o = {}) => ({ id: "x", created_at: T, submission: { typed: false, photos: o.noCover ? [] : [{ id: c.photos.items[0].id, url: "https://real.example/cover.jpg" }] }, state: {}, case: c, final: { reportNumber: "DV-2026-0007", org: { name: "Acme Auctions", color: o.color || null }, finalisedAt: T } });
const build = async (c, o = {}) => P.buildReportV3(sheetOf(c, o), { name: "Acme Auctions", color: o.color, logo: o.logo, contactEmail: "desk@acme.example" }, { fetchImage, draft: !!o.draft });
const pagesOf = r => mini.pdfPages(r.bytes).map(p => p.join(" ")), count = (r, re) => (Buffer.from(r.bytes).toString("latin1").match(re) || []).length;
const fin = await build(demo), drf = await build(demo, { draft: true });
// pages
ok("four pages for the demonstration case", fin.pages === 4 && mini.pdfPages(fin.bytes).length === 4 && count(fin, /\/Type \/Page /g) === 4, String(count(fin, /\/Type \/Page /g)));
const pg = pagesOf(fin);
ok("no empty page: every page carries its heading and real content", pg.every((t, i) => t.length > 250) && pg.map(t => /0[1-4]  [A-Z ]+/.test(t)).every(Boolean));
ok("page numbers are right: Page 1 of 4 to Page 4 of 4, each on its own page, in order", [1, 2, 3, 4].every(n => pg[n - 1].includes(`Page ${n} of 4`) && pg.filter(t => t.includes(`Page ${n} of 4`)).length === 1));
ok("every page carries the org, the report number and the version", pg.every(t => t.includes("Acme Auctions") && t.includes("DV-2026-0007") && t.includes("Version " + demo.version)));
// watermark: previews only
ok("a draft carries the DRAFT watermark on every page", pagesOf(drf).every(t => /DRAFT/.test(t)));
ok("a finalized version carries no watermark on any page", pg.every(t => !/DRAFT/.test(t)));
ok("a draft has no report number; a finalized one has", pagesOf(drf).every(t => !/DV-2026/.test(t)) && pg.every(t => /DV-2026-0007/.test(t)));
// pictures: only real ones, never a placeholder
ok("images are exactly the real ones: the cover and the two comparables that have a photo", count(fin, /\/Im\d+ Do/g) === 3, String(count(fin, /\/Im\d+ Do/g)));
const noCover = await build(demo, { noCover: true });
ok("no cover photo: a typographic cover, and no picture on the page (never a placeholder)", count(noCover, /\/Im\d+ Do/g) === 2 && pagesOf(noCover)[0].includes("1999 Porsche 911 Carrera"));
ok("a sale with no photo is a text card with its price, miles, venue, date and why", ["$", "miles", "Cars & Bids", "Same year"].every(w => pg[2].includes(w)) && pg[2].includes(pool[3].title));
// links
ok("each comparable with a source address has a clickable link to it", count(fin, /\/Subtype \/Link/g) >= 5 && pool.every(x => Buffer.from(fin.bytes).toString("latin1").includes("https://example.com/sale/" + pool.indexOf(x))));
ok("only https addresses become links", mini.pdfPages && !Buffer.from((await build((() => { const c = cl(demo); c.desk.comparables[0].url = "javascript:alert(1)"; return c; })())).bytes).toString("latin1").includes("javascript:"));
// the content is the case's: every figure and sentence on the pages is reportState's
const rs = R.reportState(demo), text = pg.join(" ");
ok("page 1 prints the range, the reserve and the explanation from the case", text.includes("$" + demo.assessment.low.toLocaleString("en-US") + " to $" + demo.assessment.high.toLocaleString("en-US")) && text.includes("$" + demo.reserve.figure.toLocaleString("en-US")) && pg[0].includes(demo.assessment.explanation.slice(0, 25)) && pg[0].includes("RECOMMENDED RESERVE") && pg[0].replace(/\s+/g, " ").includes("$" + demo.reserve.figure.toLocaleString("en-US")));
ok("page 2 prints the strip's marks, the engine's population and typical lines, and the reserve position", pg[1].includes("Median $" + rs.strip.median.toLocaleString("en-US")) && pg[1].includes("Assessed range") && pg[1].includes("Reserve $") && pg[1].includes(rs.populationLine.slice(0, 20)) && pg[1].includes(rs.reservePositionLine.slice(0, 30)));
ok("page 2 prints strengths and considerations, two columns, and the condition box", pg[1].includes("STRENGTHS") && pg[1].includes("CONSIDERATIONS") && pg[1].includes("CONDITION"));
ok("page 4 prints quarters (shown ones only), live listings with their kind, next steps, contact and version", pg[3].includes("MEDIAN BY QUARTER") && pg[3].includes("Bid $36,000") && pg[3].includes("Asking $41,000") && pg[3].includes("Not sold on Cars & Bids") && pg[3].includes("desk@acme.example") && /Version \d/.test(pg[3]));
{ const c = cl(demo); c.desk.quarters = c.desk.quarters.map(q => ({ ...q, shown: false, median: null })); c.desk.live = [];
  const t = pagesOf(await build(c))[3]; ok("no quarter shown and no live listing: those headings are not printed, nothing empty", !/MEDIAN BY QUARTER|LISTED NOW/.test(t) && /NEXT STEPS/.test(t)); }
{ const c = cl(demo); c.desk.quarters = c.desk.quarters.map((q, i) => ({ ...q, shown: i === 0, median: i === 0 ? q.median : null })); const t = pagesOf(await build(c))[3]; ok("only the shown quarters are printed", (t.match(/Q\d 20\d\d: median/g) || []).length === 1); }
// the wording follows the case
const docsOut = cl(demo); docsOut.documents[0].status = "outstanding", docsOut.documents = docsOut.documents; const outTxt = pagesOf(await build(docsOut)).join(" ");
ok("IMS reads documented with the invoices received, and reported with them outstanding, in the PDF itself", /documented by the service invoices/.test(text) && /reported by the seller, and the invoices are outstanding/.test(outTxt) && !/documented by the service invoices/.test(outTxt));
ok("the next steps drop the invoices step once received, and the PDF says so", !/Send the service invoices/.test(text) && /Send the service invoices/.test(outTxt));
{ const nr = cl(demo); nr.fields.vin = { value: "WP0AA2990XS620481", source: "seller", verified: false, candidates: [] }; nr.record = { appearances: 0, none: "x" }; const t = pagesOf(await build(nr))[3];
  ok("no prior auction record: the one sentence is in the note on page 4, and there is no page for it", /NOTE/.test(t) && /No prior auction record for this VIN\./.test(t) && pagesOf(await build(nr)).length === 4); }
ok("without that case there is no note and no such sentence anywhere", !/NOTE|No prior auction record/.test(pg[3]));
// brand and logo
const colored = await build(demo, { color: "#112233" }), plain = await build(demo, { color: null });
ok("the org's brand colour is used for the figures and marks", Buffer.from(colored.bytes).toString("latin1").includes("0.07 0.13 0.2 rg") && !Buffer.from(plain.bytes).toString("latin1").includes("0.07 0.13 0.2 rg"));
const logo = await build(demo, { logo: "https://real.example/logo.png" }); ok("the org's logo is placed at the top of the cover", count(logo, /\/Im\d+ Do/g) === 4);
// print safe: nothing outside the margins
{ const s = Buffer.from(fin.bytes).toString("latin1"), xs = [...s.matchAll(/BT \/\w+ [\d.]+ Tf [\d. ]+ rg ([\d.-]+) ([\d.-]+) Td/g)].map(m => [Number(m[1]), Number(m[2])]);
  ok("print safe margins: every text origin sits inside 36 points of the page edge", xs.length > 40 && xs.every(([x, y]) => x >= 36 && x <= 595 - 36 && y >= 36 && y <= 842 - 24), JSON.stringify(xs.filter(([x, y]) => !(x >= 36 && x <= 559 && y >= 36 && y <= 818)).slice(0, 3))); }
// the actions
{ const store = memoryStore(), cx = { org: "t", seat: "crew", store, now: T, env: {}, fetchImage }, A2 = A;
  await store.insert("t", { id: "d1", owner_seat: "crew", status: "In progress", created_at: T, submission: { typed: false, photos: [{ id: base.photos.items[0].id, url: "https://real.example/cover.jpg" }], documents: [] }, state: {}, case: demo, version: 1 });
  const d = await A2.handleSheetAction("sheet_pdf", { id: "d1", draft: true }, cx);
  ok("sheet_pdf draft on a V3 case returns the four page DRAFT report, with no report number", d.ok && d.draft && d.pages === 4 && d.reportNumber === null && mini.pdfPages(Buffer.from(d.pdf_b64, "base64")).every(p => /DRAFT/.test(p.join(" "))), JSON.stringify(d).slice(0, 120));
  const f = await A2.handleSheetAction("case_finalize", { id: "d1" }, cx), e = await A2.handleSheetAction("sheet_pdf", { id: "d1" }, cx);
  ok("sheet_pdf after case_finalize returns the four page report with its number and no watermark", f.ok && e.ok && e.pages === 4 && e.reportNumber === f.reportNumber && mini.pdfPages(Buffer.from(e.pdf_b64, "base64")).every(p => !/DRAFT/.test(p.join(" ")) && p.join(" ").includes(f.reportNumber)), JSON.stringify(e).slice(0, 160)); }
console.log(`deskPdfCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
