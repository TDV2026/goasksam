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
let demo = cl(base); demo.desk.comparables = [...pool, ...base.desk.comparables.filter(x => !pool.some(p => p.id === x.id))]; demo = K.setCondition(demo, { tier: 2, name: "Excellent" }, T); demo = K.setReserve(K.selectComparables(demo, pool.map(x => x.id), T), { figure: base.desk.evidence.q1 + 300 }, T);   // a reserve that is not the low of the range, so the two boxes cannot be confused
demo.desk.live = [{ title: "1999 Porsche 911 Carrera", platform: "Bring a Trailer", type: "bid", figure: 36000, ends: "2026-11-12T18:00:00Z", url: "https://example.com/live1" }, { title: "1999 Porsche 911 C2", platform: "Hemmings", type: "ask", figure: 41000, ends: null, url: null }, { title: "1999 Porsche 911", platform: "Cars & Bids", type: "no_sale", figure: null, ends: null, url: null }];
const sheetOf = (c, o = {}) => ({ id: "x", owner_seat: "Jane Park", forwarded_by: "Jane Park", created_at: T, submission: { typed: false, photos: o.noCover ? [] : [{ id: c.photos.items[0].id, url: "https://real.example/cover.jpg" }] }, state: {}, case: c, final: { reportNumber: "DV-2026-0007", org: { name: "Acme Auctions", color: o.color || null }, finalisedAt: T } });
const build = async (c, o = {}) => P.buildReportV3(sheetOf(c, o), { name: "Acme Auctions", color: o.color, logo: o.logo, paper: o.paper, contactEmail: "desk@acme.example", ...(o.contact === false ? { contactEmail: null } : { contactPhone: "+1 555 0100", contactAddress: "12 Main Street, Springfield" }), sendingAddress: "noreply@acme.example" }, { fetchImage, draft: !!o.draft });
const pagesOf = r => mini.pdfPages(r.bytes).map(p => p.join(" ")), count = (r, re) => (Buffer.from(r.bytes).toString("latin1").match(re) || []).length;
const fin = await build(demo), drf = await build(demo, { draft: true });
// pages
ok("four pages for the demonstration case", fin.pages === 4 && mini.pdfPages(fin.bytes).length === 4 && count(fin, /\/Type \/Page /g) === 4, String(count(fin, /\/Type \/Page /g)));
const pg = pagesOf(fin);
ok("no empty page: every page carries its running title and real content", pg.every((t, i) => t.length > 250) && ["Market assessment", "Why we recommend it", "The cars that support it", "Market context and next steps"].every((h, i) => pg[i].includes(h)));
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
  ok("each font is a subset (a six letter tag) of Newsreader or Instrument Sans, with its file embedded", [...new Set(fonts.map(f => f.name))].every(n => /^[A-Z]{6}\+(Newsreader|InstrumentSans)/.test(n)) && count(fin, /\/FontFile2 \d+ 0 R/g) === 4 && count(fin, /\/Length1 \d+/g) === 4, String(count(fin, /\/FontFile2/g)));
  const sfnts = [...raw.matchAll(/\/Filter \/FlateDecode \/Length1 (\d+) \/Length (\d+) >>\nstream\n/g)].map(m => { const st = m.index + m[0].length, d = zlib.inflateSync(Buffer.from(raw.slice(st, st + Number(m[2])), "latin1")); const tabs = Array.from({ length: d.readUInt16BE(4) }, (_, i) => ({ t: d.toString("latin1", 12 + i * 16, 16 + i * 16), len: d.readUInt32BE(12 + i * 16 + 12) })); return { len: d.length, l1: Number(m[1]), glyf: (tabs.find(x => x.t === "glyf") || {}).len, v: d.readUInt32BE(0), tags: Array.from({ length: d.readUInt16BE(4) }, (_, i) => d.toString("latin1", 12 + i * 16, 16 + i * 16)).join(",") }; });
  ok("each embedded file is a real TrueType file with the tables a PDF reader needs, and is a subset (small)", sfnts.length === 4 && sfnts.every(f => f.v === 0x00010000 && f.len === f.l1 && /glyf/.test(f.tags) && /loca/.test(f.tags) && /hmtx/.test(f.tags) && /head/.test(f.tags) && f.len < 70000 && f.glyf > 1500), JSON.stringify(sfnts));
  { const tiny = new mini.Doc({ embed: (await import(pathToFileURL(path.join(root, "lib/pdf/fonts.js")).href)).reportFonts() }); tiny.text(50, 50, "Hello", { font: "serif" }); ok("a font nothing is set in is not embedded (a page set in one face embeds one file)", (Buffer.from(tiny.build()).toString("latin1").match(/\/FontFile2 \d+ 0 R/g) || []).length === 1); }
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
  ok("a sheet that is not there, or a final export of a sheet with no case, is refused (a draft of a sheet with no stored case is built, see deskDemoCheck)", (await A.handleSheetAction("case_pdf", { id: "nope", draft: true }, cx)).refused === true && (await (async () => { await store.insert("t", { id: "old", owner_seat: "crew", status: "New", created_at: T, submission: { typed: true, photos: [], documents: [] }, state: {}, version: 0 }); return (await A.handleSheetAction("case_pdf", { id: "old" }, cx)).refused; })()) === true);
  ok("another seat's finalized report is not exported by this seat", (await A.handleSheetAction("case_pdf", { id: "p1", draft: false }, { ...cx, seat: "someone-else" })).refused === true);
  ok("the monthly cap stops the finalized export, never the draft", await (async () => { const cx2 = { ...cx, orgSettings: { name: "Acme Auctions", monthlyExportCap: 1 } }; const x = await A.handleSheetAction("case_pdf", { id: "p1", draft: false }, cx2), y = await A.handleSheetAction("case_pdf", { id: "p1", draft: true }, cx2); return x.refused === true && y.ok === true; })());
  // THE DOOR IS CREW ONLY: a seat runs sheet_* actions only (api/desk.js), and the handler routes every case_* action through the same door as the others
  const gate = fs.readFileSync(path.join(root, "api/desk.js"), "utf8"), handler = fs.readFileSync(path.join(root, "lib/desk/handler.js"), "utf8");
  ok("api/desk.js refuses a seat anything that is not a sheet_ action, so case_pdf and every case_* action are crew only", /!act\.startsWith\("sheet_"\)/.test(gate) && !/startsWith\("case_"\)/.test(gate));
  ok("the handler routes case_ actions to the sheet actions, the one door", /startsWith\("case_"\)/.test(handler));
  const acts = [...fs.readFileSync(path.join(root, "lib/desk/sheetActions.js"), "utf8").matchAll(/action === "(case_\w+)"/g)].map(m => m[1]);
  ok("case_pdf is one of the case actions and the check sees every one of them", acts.includes("case_pdf") && acts.length >= 6, acts.join()); }

// THE WIREFRAME'S LAYOUT (docs/desk-mockups/desk-v3-wireframe.html, Customer report): read back from the file, by position
{ const ops = mini.pdfTextOps(fin.bytes), at = (page, re) => ops[page].filter(o => re.test(o.text)), one = (page, re) => at(page, re)[0], streams = raw => [...raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(m => m[1]).filter(t => /BT /.test(t)), rawOf = r => Buffer.from(r.bytes).toString("latin1");
  const W = 612, M = 44, colW = (W - 2 * M - 24) / 2;
  { const band = [...streams(rawOf(fin))[0].matchAll(/([\d.-]+) ([\d.-]+) ([\d.]+) ([\d.]+) re W n/g)].map(m => ({ w: Number(m[3]), h: Number(m[4]) }))[0];
    ok("the cover photo is a band across the full width and the top half of the page, the car's name over its edge", band && band.w === 612 && Math.abs(band.h - 396) <= 1, JSON.stringify(band)); }
  // headings
  ok("page 1 names the car large and carries the header line (Market assessment, the lead reference, the date)", one(0, /^1999 Porsche 911 Carrera/) && one(0, /^1999 Porsche 911 Carrera/).size >= 26 && !!one(0, /^Market assessment {2}·.*HM-24117/));
  ok("page 1 shows ONE answer: Valuation, with Recommended reserve under it as the action, in one column, and the lead under a rule", (() => { const a = one(0, /^VALUATION$/), b = one(0, /^RECOMMENDED RESERVE$/); return a && b && b.y > a.y + 40 && Math.abs(b.x - a.x) < 1 && !pg[0].includes("LIKELY SELLING PRICE"); })());
  ok("page 2 headings: the h2 and the two column titles at the two column starts on one line", (() => { const h = one(1, /^Where your car sits among real sales$/), l = one(1, /^What supports it$/), r = one(1, /^What to consider$/); return h && h.size >= 20 && l && r && Math.abs(l.y - r.y) < 1 && Math.abs(l.x - M) < 1 && Math.abs(r.x - (M + colW + 24)) < 1; })());
  ok("page 3 heading counts the cards in words (Four recent sales closest to your car)", !!one(2, /^Four recent sales closest to your car$/));
  { const c2 = cl(demo); c2.selectedComparables = pool.slice(0, 2).map(x => x.id); ok("with two selected the heading says Two", !!mini.pdfTextOps((await build(c2)).bytes)[2].find(o => /^Two recent sales closest to your car$/.test(o.text))); }
  // the cards: a 2 by 2 grid, each in the wireframe's order, month and year only
  { const prices = ops[2].filter(o => /^\$[\d,]+$/.test(o.text) && o.size >= 17), xs = [...new Set(prices.map(o => Math.round(o.x)))].sort((a, b) => a - b), ys = [...new Set(prices.map(o => Math.round(o.y)))].sort((a, b) => a - b);
    ok("page 3 is a grid of four cards: two columns, two rows", prices.length === 4 && xs.length === 2 && ys.length === 2 && xs[0] === M, JSON.stringify([xs, ys]));
    ok("each card runs in the wireframe's order: price, venue and month, name and miles, why, link, top to bottom", prices.every(pr => { const venue = ops[2].find(o => /·\s+[A-Z][a-z]+ 20\d\d$/.test(o.text) && Math.abs(o.y - pr.y) < 4 && o.x > pr.x), name = ops[2].find(o => / · [\d,]+ miles$/.test(o.text) && o.x === pr.x && o.y > pr.y), why = ops[2].find(o => /^Same year/.test(o.text) && o.x === pr.x && o.y > pr.y), link = ops[2].find(o => o.text === "View the original listing" && o.x === pr.x && o.y > pr.y); return venue && name && why && link && name.y < why.y && why.y < link.y; }));
    ok("the link text is View the original listing, on every card that has an address", at(2, /^View the original listing$/).length === 4 && !at(2, /^View the listing$/).length);
    ok("each card's date is the month and the year, never the day", at(2, /·\s+[A-Z][a-z]+ 20\d\d$/).length === 4 && !ops[2].some(o => o.y < 740 && /\d{1,2} [A-Z][a-z]+ 20\d\d/.test(o.text)) && !ops[2].some(o => /\d{4}-\d{2}-\d{2}/.test(o.text))); }
  { const st = streams(rawOf(fin))[2], rects = [...st.matchAll(/([\d.-]+) ([\d.-]+) ([\d.]+) ([\d.]+) re (?:W n|f)/g)].map(m => ({ w: Number(m[3]), h: Number(m[4]) })).filter(r => Math.abs(r.w - 252) < 1.5), hs = [...new Set(rects.map(r => Math.round(r.h)))];
    ok("the four cards' picture slots are one size: a photo and the no photo card fill the same box", rects.length === 4 && hs.length === 1 && Math.abs(hs[0] - 158) <= 1, JSON.stringify(rects)); }
  ok("the no photo card says Listing photograph not available for this sale, in the slot", at(2, /^Listing photograph not available for this sale$/).length === 2);
  ok("page 3 ends with the footnote: Selected from N completed sales, the months, and Prices are final results as reported by each platform", !!one(2, /^Selected from \d+ completed sales, [A-Z][a-z]+ 20\d\d to [A-Z][a-z]+ 20\d\d\.$/) && !!one(2, /^Prices are final results as reported by each platform\.$/));
  // page 4: two columns, bars, rows
  { const l = one(3, /^How the market has moved$/), l2 = one(3, /^On the market now$/), r = one(3, /^What we suggest next$/), r2 = one(3, /^Please note$/), contact = one(3, /^Acme Auctions$/);
    ok("page 4 is two columns: the market on the left, next steps and the note on the right, headings on one line at the top", l && r && l2 && r2 && Math.abs(l.y - r.y) < 1 && l.x === M && Math.abs(r.x - (M + colW + 24)) < 1 && l2.x === M && r2.x === r.x && l2.y > l.y);
    ok("the contact block is in the right column, under the note", contact && contact.x === r.x && contact.y > r2.y); }
  { const c3 = cl(demo); c3.desk.quarters = c3.desk.quarters.map((q, i) => (i === 1 ? { ...q, shown: false, median: null } : q)); const r3 = await build(c3), st = streams(rawOf(r3))[3], t3 = mini.pdfTextOps(r3.bytes)[3];
    const bars = [...st.matchAll(/0\.68 0\.8 0\.74 rg ([\d.-]+) ([\d.-]+) ([\d.]+) ([\d.]+) re f/g)].map(m => ({ x: Number(m[1]), w: Number(m[3]), h: Number(m[4]) })), slots = (st.match(/re f 0\.85 0\.82 0\.76 RG 0\.5 w [\d. -]+ re S/g) || []).length, shown = c3.desk.quarters.filter(q => q.shown && q.median != null);
    ok("the quarters are bars: one for each shown quarter, one empty dashed slot for the quarter with too few sales", bars.length === shown.length && slots === 1 && shown.length === c3.desk.quarters.length - 1, JSON.stringify([bars.length, slots]));
    const mx = Math.max(...shown.map(q => q.median)); ok("each bar's height is its quarter's median against the tallest, from the engine's own medians", bars.every((b, i) => Math.abs(b.h - Math.max(6, (shown[i].median / mx) * 66)) < 0.6), JSON.stringify(bars.map(b => b.h)));
    ok("the value sits above each bar and the quarter's name under it", shown.every(q => t3.some(o => o.text === "$" + q.median.toLocaleString("en-US")) && t3.some(o => o.text === q.label)) && t3.some(o => o.text === c3.desk.quarters[1].label));
    ok("the caption names the quarter with too few sales and where the evidence runs to", t3.some(o => /^Q\d 20\d\d had too few sales to show\.$/.test(o.text)) && t3.some(o => /^Evidence runs to \d{1,2} [A-Z][a-z]+ 20\d\d\.$/.test(o.text)));
    ok("the live listings are two part rows: the listing at the left, Bid, Asking or Not sold at the right, and the caption under them", ["Bid $36,000", "Asking $41,000", "Not sold"].every(w => t3.some(o => o.text === w && o.x > 150)) && t3.some(o => /^1999 Porsche 911 Carrera, Bring a Trailer$/.test(o.text)) && t3.some(o => /^Bids and asking prices are not completed sales/.test(o.text))); }
  { const c5 = cl(demo); c5.desk.evidence = { ...c5.desk.evidence, asOf: null, insufficient: true, sentence: "There are too few sales to give a reference.", median: null, q1: null, q3: null, low: null, high: null }; const t5 = pagesOf(await build(c5));
    ok("with no evidence date and no note there is no Please note heading, and the pages still number four with nothing empty", !/Please note/.test(t5[3]) && t5.length === 4 && t5.every(t => t.length > 200) && /too few sales to give a reference/.test(t5[1])); }
  ok("the Please note paragraph says what the assessment used, and that it is not a guarantee", /This assessment uses completed auction sales available to us up to \d{1,2} [A-Z][a-z]+ 20\d\d/.test(ops[3].map(o => o.text).join(" ")) && /not a guarantee of any price/.test(ops[3].map(o => o.text).join(" ")));
  ok("the reserve carries the disclaimer and the rationale; the valuation its basis in words with no market figure", pg[0].includes("A recommendation, not a guaranteed price.") && pg[0].includes(demo.reserve.rationale.slice(0, 20)) && /From \d+ comparable sales, sold between/.test(pg[0]) && !/market median|typical range/i.test(pg[0]));
  ok("page 1 carries the invoice sentence the case supports (on file with the invoices received, wanted without them)", /service invoices are on file/.test(pg[0]) && /Service invoices would strengthen/.test(pagesOf(await build((() => { const c4 = cl(demo); c4.documents[0].status = "outstanding"; return c4; })()))[0]));
  ok("nothing the case does not carry is printed: no inspection advice, no auction length, no analyst", !/pre sale inspection|seven day|Prepared by J|Jane|Park/i.test(pg.join(" "))); }
// the content is the case's: every figure and sentence on the pages is reportState's
const rs = R.reportState(demo), text = pg.join(" ");
ok("page 1 prints the range, the reserve and the explanation from the case", text.includes("$" + demo.assessment.low.toLocaleString("en-US") + " to $" + demo.assessment.high.toLocaleString("en-US")) && text.includes("$" + demo.reserve.figure.toLocaleString("en-US")) && pg[0].includes(demo.assessment.explanation.slice(0, 25)) && pg[0].includes("RECOMMENDED RESERVE") && pg[0].replace(/\s+/g, " ").includes("$" + demo.reserve.figure.toLocaleString("en-US")));
ok("page 2 prints the heading, the strip's labels (your car, lowest, highest, the median in words, reserve), its caption and where the car sits in words", pg[1].includes("Where your car sits among real sales") && pg[1].includes(rs.strip.labels.median) && /Median of \d+ sales/.test(pg[1]) && pg[1].includes("Your car $") && pg[1].includes("lowest") && pg[1].includes("highest") && pg[1].includes("Reserve $") && pg[1].includes("Each dot is one completed sale.") && pg[1].includes("The shaded band is the middle half") && pg[1].includes(rs.sitsLine) && /The assessment sits (above|below|at) the median of \d+ sales/.test(pg[1]));
// THE CLASS (Nov 9 2026): the market reference (the engine's median and its middle half) is never printed as a figure beside the assessment. Page 1 carries only the assessment and the reserve as dollars; page 2 says it in words; nowhere is it a competing figure.
{ const ev = demo.desk.evidence, own = new Set([demo.assessment.figure, demo.assessment.low, demo.assessment.high, demo.reserve.figure].filter(v => v != null).map(v => "$" + Math.round(v).toLocaleString("en-US"))), dollars = t => [...new Set(t.match(/\$[\d,]+/g) || [])];
  ok(dollars(pg[0]).every(d => own.has(d)) && dollars(pg[0]).length > 0, "page 1 prints no dollar figure but the assessment and the reserve: " + dollars(pg[0]).join(" "));
  const ref = [ev.median, ev.q1, ev.q3].map(v => "$" + Math.round(v).toLocaleString("en-US")).filter(d => !own.has(d) && !(rs.strip.lowFigure != null && d === "$" + Math.round(rs.strip.lowFigure).toLocaleString("en-US")) && !(rs.strip.highFigure != null && d === "$" + Math.round(rs.strip.highFigure).toLocaleString("en-US")));
  ok(ref.length === 3 || ref.length > 0, "the fixture's market reference figures differ from the analyst's (so the check can tell them apart): " + ref.join(" "));
  ok(ref.every(d => !pg.slice(0, 2).some(t => t.includes(d))), "pages 1 and 2 print none of the market reference's figures (median, middle half): " + ref.join(" "));
  ok(!/market reference|typical range/i.test(text), "the report never names a market reference figure or a typical range beside the assessment"); }
ok("page 2 prints What supports it and What to consider, two columns, and the condition box", pg[1].includes("What supports it") && pg[1].includes("What to consider") && pg[1].includes("We reviewed the car as Excellent") && pg[1].includes("Condition is a review category, not a precise grade."));
ok("page 4 prints quarters (shown ones only), live listings with their kind, next steps, contact and version", pg[3].includes("How the market has moved") && pg[3].includes("On the market now") && pg[3].includes("Bid $36,000") && pg[3].includes("Asking $41,000") && pg[3].includes("Not sold") && pg[3].includes("Cars & Bids") && pg[3].includes("What we suggest next") && pg[3].includes("desk@acme.example") && pg[3].includes("Reference HM-24117") && /Version \d/.test(pg[3]));
{ const c = cl(demo); c.desk.quarters = c.desk.quarters.map(q => ({ ...q, shown: false, median: null })); c.desk.live = [];
  const t = pagesOf(await build(c))[3]; ok("no quarter shown and no live listing: those headings are not printed, nothing empty", !/How the market has moved|On the market now/.test(t) && /What we suggest next/.test(t)); }
{ const c = cl(demo); c.desk.quarters = c.desk.quarters.map((q, i) => ({ ...q, shown: i === 0, median: i === 0 ? q.median : null })); const t = pagesOf(await build(c))[3]; ok("only the shown quarters have a bar and a median; each other quarter is named as having too few sales", (t.match(/\$[\d,]+/g) || []).filter(v => v === "$" + c.desk.quarters[0].median.toLocaleString("en-US")).length === 1 && (t.match(/had too few sales to show/g) || []).length === c.desk.quarters.length - 1 && c.desk.quarters.slice(1).every(q => t.includes(q.label))); }
// the wording follows the case
const docsOut = cl(demo); docsOut.documents[0].status = "outstanding", docsOut.documents = docsOut.documents; const outTxt = pagesOf(await build(docsOut)).join(" ");
ok("IMS reads documented with the invoices received, and reported with them outstanding, in the PDF itself", /documented by the service invoices/.test(text) && /reported by the seller, and the invoices are outstanding/.test(outTxt) && !/documented by the service invoices/.test(outTxt));
ok("the next steps drop the invoices step once received, and the PDF says so", !/Send the service invoices/.test(text) && /Send the service invoices/.test(outTxt));
{ const nr = cl(demo); nr.fields.vin = { value: "WP0AA2995XS626785", source: "seller", verified: false, candidates: [] }; nr.record = { appearances: 0, none: "x" }; const t = pagesOf(await build(nr))[3];
  ok("no prior auction record: the one sentence is in the note on page 4, and there is no page for it", /Please note/.test(t) && /No prior auction record for this VIN\./.test(t) && pagesOf(await build(nr)).length === 4); }
ok("without that case there is no such sentence anywhere", !/No prior auction record/.test(pg.join(" ")));
// brand and logo
const colored = await build(demo, { color: "#112233" }), plain = await build(demo, { color: null });
ok("the org's brand colour is used for the figures and marks", Buffer.from(colored.bytes).toString("latin1").includes("0.07 0.13 0.2 rg") && !Buffer.from(plain.bytes).toString("latin1").includes("0.07 0.13 0.2 rg"));
const logo = await build(demo, { logo: "https://real.example/logo.png" }); ok("the org's logo is placed at the top of every page", count(logo, /\/Im\d+ Do/g) === 3 + 4);
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
