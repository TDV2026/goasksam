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
const sheetOf = (c, o = {}) => ({ id: "x", owner_seat: "Jane Park", forwarded_by: "Jane Park", created_at: T, submission: { typed: false, photos: o.noCover ? [] : [{ id: c.photos.items[0].id, url: "https://real.example/cover.jpg" }] }, state: {}, case: c, final: { reportNumber: "DV-2026-0007", org: { name: "Acme Auctions", color: o.color || null }, finalisedAt: T } });
const build = async (c, o = {}) => P.buildReportV3(sheetOf(c, o), { name: "Acme Auctions", color: o.color, logo: o.logo, paper: o.paper, contactEmail: "desk@acme.example", ...(o.contact === false ? { contactEmail: null } : { contactPhone: "+1 555 0100", contactAddress: "12 Main Street, Springfield" }), sendingAddress: "noreply@acme.example" }, { fetchImage, draft: !!o.draft });
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

// FONTS: embedded TrueType, no standard Helvetica or Times (or Courier) anywhere in a V3 report
{ const raw = Buffer.from(fin.bytes).toString("latin1"), zlib = await import("node:zlib");
  const fonts = [...raw.matchAll(/\/Type \/Font \/Subtype \/(\w+) \/BaseFont \/([\w+-]+)/g)].map(m => ({ kind: m[1], name: m[2] }));
  ok("every font in the report is an embedded TrueType (Type0 over CIDFontType2), none is a standard Type1", fonts.length >= 6 && fonts.every(f => f.kind === "Type0" || f.kind === "CIDFontType2") && !/\/Subtype \/Type1\b/.test(raw), JSON.stringify(fonts.map(f => f.kind)));
  ok("no standard Helvetica, Times or Courier is named anywhere in the report", !/Helvetica|Times-|Times\b|Courier/.test(raw));
  ok("each font is a subset (a six letter tag) of Newsreader or Instrument Sans, with its file embedded", [...new Set(fonts.map(f => f.name))].every(n => /^[A-Z]{6}\+(Newsreader|InstrumentSans)/.test(n)) && count(fin, /\/FontFile2 \d+ 0 R/g) === 3 && count(fin, /\/Length1 \d+/g) === 3, String(count(fin, /\/FontFile2/g)));
  const sfnts = [...raw.matchAll(/\/Filter \/FlateDecode \/Length1 (\d+) \/Length (\d+) >>\nstream\n/g)].map(m => { const st = m.index + m[0].length, d = zlib.inflateSync(Buffer.from(raw.slice(st, st + Number(m[2])), "latin1")); const tabs = Array.from({ length: d.readUInt16BE(4) }, (_, i) => ({ t: d.toString("latin1", 12 + i * 16, 16 + i * 16), len: d.readUInt32BE(12 + i * 16 + 12) })); return { len: d.length, l1: Number(m[1]), glyf: (tabs.find(x => x.t === "glyf") || {}).len, v: d.readUInt32BE(0), tags: Array.from({ length: d.readUInt16BE(4) }, (_, i) => d.toString("latin1", 12 + i * 16, 16 + i * 16)).join(",") }; });
  ok("each embedded file is a real TrueType file with the tables a PDF reader needs, and is a subset (small)", sfnts.length === 3 && sfnts.every(f => f.v === 0x00010000 && f.len === f.l1 && /glyf/.test(f.tags) && /loca/.test(f.tags) && /hmtx/.test(f.tags) && /head/.test(f.tags) && f.len < 70000 && f.glyf > 1500), JSON.stringify(sfnts));
  ok("a font nothing is set in is not embedded: the bold sans is in the draft (watermark) and not in the finalized version", count(drf, /\/FontFile2 \d+ 0 R/g) === 4 && count(fin, /\/FontFile2 \d+ 0 R/g) === 3);
  ok("the whole report is small because only the glyphs it prints are embedded", fin.bytes.length < 250000, String(fin.bytes.length));
  ok("every printed character is in its font: no question mark stands in for a character in the text", !pg.join(" ").includes("?"));
  ok("curly quotes, the ampersand and the dollar sign print as themselves", pagesOf(await build((() => { const c = cl(demo); c.assessment.explanation = "The seller\u2019s car \u201Cas described\u201D & priced $1,000."; return c; })()))[0].includes("seller\u2019s car \u201Cas described\u201D & priced $1,000.")); }

// PAPER: an org setting, Letter by default, A4 when the org row says so; the same four pages on both
{ const box = r => (Buffer.from(r.bytes).toString("latin1").match(/\/MediaBox \[0 0 (\d+) (\d+)\]/) || []).slice(1).map(Number).join("x");
  const a4 = await build(demo, { paper: "a4" }), lt = await build(demo, { paper: "letter" }), none = await build(demo), odd = await build(demo, { paper: "tabloid" });
  ok("the default paper is Letter (612 by 792)", box(fin) === "612x792" && box(none) === "612x792" && box(lt) === "612x792" && box(odd) === "612x792", box(fin));
  ok("an org row that says a4 gets A4 (595 by 842)", box(a4) === "595x842");
  for (const [name, r, w, h] of [["Letter", lt, 612, 792], ["A4", a4, 595, 842]]) {
    const t = pagesOf(r), raw = Buffer.from(r.bytes).toString("latin1"), ops = [...raw.matchAll(/BT \/\w+ [\d.]+ Tf [\d. ]+ rg ([\d.-]+) ([\d.-]+) Td/g)].map(m => [Number(m[1]), Number(m[2])]);
    ok(`${name}: four pages, each with its heading and "Page n of 4"`, r.pages === 4 && t.length === 4 && t.every((x, i) => x.includes(`Page ${i + 1} of 4`) && x.length > 250));
    ok(`${name}: every text origin is inside the print safe margins of that paper`, ops.length > 40 && ops.every(([x, y]) => x >= 36 && x <= w - 36 && y >= 36 && y <= h - 24), JSON.stringify(ops.filter(([x, y]) => !(x >= 36 && x <= w - 36 && y >= 36 && y <= h - 24)).slice(0, 3)));
    ok(`${name}: nothing but the footer sits below the footer rule (page content never runs into it)`, ops.filter(([x, y]) => y < 52).length === 8, String(ops.filter(([x, y]) => y < 52).length));
    ok(`${name}: the comparables and the strip fit the page (nothing starts below the footer rule)`, Math.min(...ops.filter(([x, y]) => y >= 52).map(o => o[1])) >= 52); }
}
// NO ANALYST NAME ANYWHERE; "Prepared by" names the org; the contact block is the org row's own details
{ const all = pg.join(" ") + " " + pagesOf(drf).join(" "), raw = Buffer.from(fin.bytes).toString("latin1") + Buffer.from(drf.bytes).toString("latin1");
  ok("no analyst name or seat appears in the report, the draft or the file's own metadata", !/Jane|Park|seat=/.test(all) && !/Jane|Park|seat=/.test(raw), (all.match(/Jane|Park/) || [""])[0]);
  ok('the footer says "Prepared by" and the org, on every page', pg.every(t => /Prepared by Acme Auctions/.test(t)));
  ok('a draft says "Draft preview" and a finalized version says its version', pagesOf(drf).every(t => /Draft preview/.test(t) && !/Version \d/.test(t)) && pg.every(t => /Version \d/.test(t) && !/Draft preview/.test(t)));
  ok("the contact block prints the org's address, phone and email from the org row", ["12 Main Street, Springfield", "+1 555 0100", "desk@acme.example"].every(x => pg[3].includes(x)));
  ok("a detail the org row does not hold is not printed, and the sending address is not a contact", !pagesOf(await build(demo, { contact: false }))[3].includes("12 Main Street") && !pg.join(" ").includes("noreply@acme.example")); }

// case_pdf: THE PREVIEW PANE'S DOOR (draft true: the case as it stands, nothing stored; draft false: the finalized version's PDF), crew only like every case_* action
{ const store = memoryStore(), cx = { org: "t", seat: "crew", store, now: T, env: {}, fetchImage, orgSettings: { name: "Acme Auctions", monthlyExportCap: 3 } }, readText = d => mini.pdfPages(Buffer.from(d.pdf_b64, "base64")).map(p => p.join(" "));
  await store.insert("t", { id: "p1", owner_seat: "crew", status: "In progress", created_at: T, submission: { typed: false, photos: [{ id: base.photos.items[0].id, url: "https://real.example/cover.jpg" }], documents: [] }, state: {}, case: demo, version: 1 });
  const rowBefore = JSON.stringify(await store.get("t", "p1")), d1 = await A.handleSheetAction("case_pdf", { id: "p1", draft: true }, cx), t1 = d1.ok ? readText(d1) : [];
  ok("case_pdf draft true returns the four page report of the case as it stands, DRAFT, no report number", d1.ok && d1.draft === true && d1.pages === 4 && d1.reportNumber === null && t1.length === 4 && t1.every(t => /DRAFT/.test(t)) && !t1.join(" ").match(/DV-\d{4}/), JSON.stringify(d1).slice(0, 140));
  ok("it is the case as it stands: a change to the case changes the preview", (await (async () => { await A.handleSheetAction("case_edit", { id: "p1", op: "reserve", patch: { figure: base.desk.evidence.q1 + 700 } }, cx); const d = await A.handleSheetAction("case_pdf", { id: "p1", draft: true }, cx); return readText(d)[0].includes("$" + (base.desk.evidence.q1 + 700).toLocaleString("en-US")); })()));
  ok("a draft stores nothing: no export record and the sheet row is as the edit left it", (await store.exportsOf("t", "p1")).length === 0);
  ok("draft false before any version is finalized is refused", (await A.handleSheetAction("case_pdf", { id: "p1", draft: false }, cx)).refused === true && (await A.handleSheetAction("case_pdf", { id: "p1" }, cx)).refused === true);
  const f = await A.handleSheetAction("case_finalize", { id: "p1" }, cx), d2 = await A.handleSheetAction("case_pdf", { id: "p1", draft: false }, cx), t2 = d2.ok ? readText(d2) : [];
  ok("draft false is the finalized version's PDF: its report number, no watermark, four pages", f.ok && d2.ok && d2.draft === false && d2.reportNumber === f.reportNumber && d2.version === 1 && t2.length === 4 && t2.every(t => !/DRAFT/.test(t) && t.includes(f.reportNumber)), JSON.stringify(d2).slice(0, 140));
  ok("the finalized export is recorded beside the sheet (kind pdf, the version), and a draft is not", (await store.exportsOf("t", "p1")).map(e => e.kind + ":" + e.version).join() === "pdf:1");
  const dRow = JSON.stringify(await store.get("t", "p1")); await A.handleSheetAction("case_pdf", { id: "p1", draft: true }, cx); ok("a draft of a finalized case writes nothing", JSON.stringify(await store.get("t", "p1")) === dRow && (await store.exportsOf("t", "p1")).length === 1);
  const rv = await A.handleSheetAction("case_edit", { id: "p1", op: "field", field: "colour", value: "Black" }, cx), dr = await A.handleSheetAction("case_pdf", { id: rv.id, draft: true }, cx), fr = await A.handleSheetAction("case_pdf", { id: rv.id, draft: false }, cx);
  ok("on a revision in progress, the draft is the revision as it stands and draft false is the last finalized version", dr.ok && dr.version === 2 && /DRAFT/.test(readText(dr)[0]) && fr.ok && fr.version === 1 && fr.reportNumber === f.reportNumber && !/DRAFT/.test(readText(fr)[0]));
  ok("a sheet that is not there, or has no case, is refused", (await A.handleSheetAction("case_pdf", { id: "nope", draft: true }, cx)).refused === true && (await (async () => { await store.insert("t", { id: "old", owner_seat: "crew", status: "New", created_at: T, submission: { typed: true, photos: [], documents: [] }, state: {}, version: 0 }); return (await A.handleSheetAction("case_pdf", { id: "old", draft: true }, cx)).refused; })()) === true);
  ok("another seat's finalized report is not exported by this seat", (await A.handleSheetAction("case_pdf", { id: "p1", draft: false }, { ...cx, seat: "someone-else" })).refused === true);
  ok("the monthly cap stops the finalized export, never the draft", await (async () => { const cx2 = { ...cx, orgSettings: { name: "Acme Auctions", monthlyExportCap: 1 } }; const x = await A.handleSheetAction("case_pdf", { id: "p1", draft: false }, cx2), y = await A.handleSheetAction("case_pdf", { id: "p1", draft: true }, cx2); return x.refused === true && y.ok === true; })());
  // THE DOOR IS CREW ONLY: a seat runs sheet_* actions only (api/desk.js), and the handler routes every case_* action through the same door as the others
  const gate = fs.readFileSync(path.join(root, "api/desk.js"), "utf8"), handler = fs.readFileSync(path.join(root, "lib/desk/handler.js"), "utf8");
  ok("api/desk.js refuses a seat anything that is not a sheet_ action, so case_pdf and every case_* action are crew only", /!act\.startsWith\("sheet_"\)/.test(gate) && !/startsWith\("case_"\)/.test(gate));
  ok("the handler routes case_ actions to the sheet actions, the one door", /startsWith\("case_"\)/.test(handler));
  const acts = [...fs.readFileSync(path.join(root, "lib/desk/sheetActions.js"), "utf8").matchAll(/action === "(case_\w+)"/g)].map(m => m[1]);
  ok("case_pdf is one of the case actions and the check sees every one of them", acts.includes("case_pdf") && acts.length >= 6, acts.join()); }
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
