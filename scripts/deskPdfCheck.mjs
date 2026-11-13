// Desk v3 stage 4: the four page report. node scripts/deskPdfCheck.mjs [rootDir]
import path from "node:path"; import fs from "node:fs"; import { pathToFileURL } from "node:url"; import { setup } from "./_deskCaseWorld.mjs";
const root = path.resolve(process.argv[2] || "."), { M, K, read, readyCase, T, today } = await setup(root), imp = f => import(pathToFileURL(path.join(root, f)).href);
const P = await imp("lib/desk/reportPdfV3.js"), R = await imp("lib/desk/reportState.js"), mini = await imp("lib/pdf/mini.js"), A = await imp("lib/desk/sheetActions.js"), { memoryStore } = await imp("lib/desk/sheetStore.js");
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? "  " + d : "")); } }; const cl = x => structuredClone(x);
const PNG = fs.readFileSync(path.join(root, "public/icon-512.png"));   // a real picture: the check never needs a placeholder
const fetchImage = async u => (/real\.example/.test(String(u)) ? PNG : null);
const base = await readyCase();
// the demonstration case: four comparables selected, two of them with a photo, a real cover
const pool = base.desk.comparables.filter(x => x.inPopulation).slice(0, 4).map((x, i) => ({ ...x, photo: i < 2 ? "https://real.example/" + i + ".jpg" : null, url: "https://example.com/sale/" + i }));
let demo = cl(base); demo.condition = { ...demo.condition, selected: { tier: 2, name: "Excellent" } }; demo.desk.comparables = [...pool, ...base.desk.comparables.filter(x => !pool.some(p => p.id === x.id))];
// (the fixture sets the chosen condition on the case without the switch, which would take the engine's stored view over the fixture's photos)
demo = K.setReserve(K.selectComparables(demo, pool.map(x => x.id), T), { figure: base.desk.evidence.q1 + 300, sellerRequested: true }, T);   // (the Excellent pool is too thin for the engine to support any reserve, so it is marked as the seller's request) a reserve that is not the low of the range, so the two boxes cannot be confused
demo.desk.reserveCheck = (await read(K.recallInput(demo, today))).desk.reserveCheck;   // the engine's check of that very reserve
demo.desk.view = K.viewOfCase(demo); demo.desk.key = K.recallKey(demo);   // the stored answer is the fixture's own: it is the one the case holds, so nothing recalls it
demo.desk.live = [{ title: "1999 Porsche 911 Carrera", platform: "Bring a Trailer", type: "bid", figure: 36000, ends: "2026-11-12T18:00:00Z", url: "https://example.com/live1" }, { title: "1999 Porsche 911 C2", platform: "Hemmings", type: "ask", figure: 41000, ends: null, url: null }, { title: "1999 Porsche 911", platform: "Cars & Bids", type: "no_sale", figure: null, ends: null, url: null }];
const sheetOf = (c, o = {}) => ({ id: "x", owner_seat: "Jane Park", forwarded_by: "Jane Park", created_at: T, submission: { typed: false, photos: o.noCover ? [] : [{ id: c.photos.items[0].id, url: "https://real.example/cover.jpg" }] }, state: {}, case: c, final: { reportNumber: "DV-2026-0007", org: { name: "Acme Auctions", color: o.color || null }, finalisedAt: T } });
const build = async (c, o = {}) => P.buildReportV3(sheetOf(c, o), { name: "Acme Auctions", color: o.color, logo: o.logo, paper: o.paper, contactEmail: "desk@acme.example", ...(o.contact === false ? { contactEmail: null } : { contactPhone: "+1 555 0100", contactAddress: "12 Main Street, Springfield" }), sendingAddress: "noreply@acme.example" }, { fetchImage, draft: !!o.draft });
const pagesOf = r => mini.pdfPages(r.bytes).map(p => p.join(" ")), count = (r, re) => (Buffer.from(r.bytes).toString("latin1").match(re) || []).length;
const fin = await build(demo), drf = await build(demo, { draft: true });
// pages
ok("four pages for the demonstration case", fin.pages === 4 && mini.pdfPages(fin.bytes).length === 4 && count(fin, /\/Type \/Page /g) === 4, String(count(fin, /\/Type \/Page /g)));
const pg = pagesOf(fin);
ok("no empty page: every page carries its running title and real content", pg.every((t, i) => t.length > 250) && ["Reserve recommendation", "Why this reserve", "The sales behind it", "What happens next"].every((h, i) => pg[i].includes(h)));
ok("page numbers are right: Page 1 of 4 to Page 4 of 4, each on its own page, in order", [1, 2, 3, 4].every(n => pg[n - 1].includes(`Page ${n} of 4`) && pg.filter(t => t.includes(`Page ${n} of 4`)).length === 1));
ok("every page carries the org, the report number and the version", pg.every(t => t.includes("Acme Auctions") && t.includes("DV-2026-0007") && t.includes("Version " + demo.version)));
// watermark: previews only
ok("a draft carries the DRAFT watermark on every page", pagesOf(drf).every(t => /DRAFT/.test(t)));
ok("a finalized version carries no watermark on any page", pg.every(t => !/DRAFT/.test(t)));
ok("a draft has no report number; a finalized one has", pagesOf(drf).every(t => !/DV-2026/.test(t)) && pg.every(t => /DV-2026-0007/.test(t)));
// pictures: only real ones, never a placeholder
ok("images are exactly the real ones: the cover and the two comparables that have a photo", count(fin, /\/Im\d+ Do/g) === 3 + (demo.photos.reportIds.length ? 1 : 0), String(count(fin, /\/Im\d+ Do/g)));
const noCover = await build(demo, { noCover: true });
ok("no cover photo: a typographic cover, and no picture on the page (never a placeholder)", count(noCover, /\/Im\d+ Do/g) === 2 + (demo.photos.reportIds.length ? 1 : 0) - 1 + 0 && pagesOf(noCover)[0].includes(demo.desk.titleLine));
ok("a sale with no photo is a text card with its price, miles, venue, date and why", ["$", "miles", "Cars & Bids", "Same year"].every(w => pg[2].includes(w)) && pg[2].includes(pool[3].title));
// links
ok("each comparable with a source address has a clickable link to it", count(fin, /\/Subtype \/Link/g) >= 4 && pool.every(x => Buffer.from(fin.bytes).toString("latin1").includes("https://example.com/sale/" + pool.indexOf(x))));
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
  ok("curly quotes, the ampersand and the dollar sign print as themselves", pagesOf(await build((() => { const c = cl(demo); c.reserve.why = "The seller\u2019s car \u201Cas described\u201D & priced $1,000."; return c; })()))[0].includes("seller\u2019s car \u201Cas described\u201D & priced $1,000.")); }

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
{ const store = memoryStore(), cx = { org: "t", seat: "crew", store, now: T, env: {}, readSheet: async (e, input) => read(input), fetchImage, orgSettings: { name: "Acme Auctions", monthlyExportCap: 3 } }, readText = d => mini.pdfPages(Buffer.from(d.pdf_b64, "base64")).map(p => p.join(" "));
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

// DESK V4 SELLER REPORT (docs/desk-mockups/desk-v4.html "Report rules"): read back from the file. Every sentence is reportState's v4 object; the PDF only places it.
const rs = R.reportState(demo), v4 = rs.v4, text = pg.join(" "), ops = mini.pdfTextOps(fin.bytes), at = (page, re) => ops[page].filter(o => re.test(o.text)), money = n => "$" + Math.round(n).toLocaleString("en-US");
ok("the four pages are headed Reserve recommendation, Why this reserve, The sales behind it and What happens next", ["Reserve recommendation", "Why this reserve", "The sales behind it", "What happens next"].every((h, i) => pg[i].includes(h)));
ok("page 1 is the engine's title of the car, never the typed label, with the engine's spec line", demo.desk.titleLine && at(0, new RegExp("^" + demo.desk.titleLine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).length > 0 && (!demo.desk.specLine || pg[0].includes(demo.desk.specLine.slice(0, 20))), String(demo.desk.titleLine));
ok("page 1 carries ONE figure, the recommended reserve, set large, and the engine's own count of the sales that reached it", at(0, new RegExp("^" + money(demo.reserve.figure).replace("$", "\\$") + "$")).some(o => o.size >= 36) && at(0, /^Recommended reserve$/i).length === 1 && demo.desk.reserveCheck.reachedLine && pg[0].includes(`${demo.desk.reserveCheck.of} of these cars sold at auction`), String(demo.desk.reserveCheck.reachedLine));
// THE SELLER'S WORDS FOR THE RESERVE CHECK (Sam, Nov 12 2026: the report printed "29 of 39 sales reached this figure", the analyst's short line). Every report prints the table's sentence with the engine's two counts and the figure; the analyst's panel keeps the short line.
{ const ck = demo.desk.reserveCheck, want = `Over the last ${demo.windowMonths || 12} months ${ck.of} of these cars sold at auction. ${ck.reached === 0 ? "None of them" : ck.reached === ck.of ? "All of them" : ck.reached + " of them"} sold for ${money(ck.reserve)} or more.`;
  ok("page 1 prints the seller's sentence for the reserve check, from the engine's two counts and the figure", pg[0].includes(want), want + " | " + pg[0].slice(0, 400));
  ok("no page of the seller's report prints the analyst's short line (N of M sales reached this figure)", pg.every(t => !/reached this figure/.test(t)) && R.reportState(demo).reachedLine === want, String(R.reportState(demo).reachedLine));
  ok("the analyst's panel keeps the engine's short line", /^\d+ of \d+ sales? reached this figure\.$/.test(ck.reachedLine), ck.reachedLine);
  for (const [of, reached, fig, re] of [[1, 1, 27500, /^Over the last 12 months 1 of these cars sold at auction\. It sold for \$27,500 or more\.$/], [39, 29, 27500, /^Over the last 12 months 39 of these cars sold at auction\. 29 of them sold for \$27,500 or more\.$/], [8, 0, 40000, /None of them sold for \$40,000 or more\.$/], [5, 5, 20000, /All of them sold for \$20,000 or more\.$/]]) { const c2 = cl(demo); c2.windowMonths = 12; c2.reserve.figure = fig; c2.desk.reserveCheck = { ...c2.desk.reserveCheck, of, reached, reserve: fig }; ok(`the sentence for ${reached} of ${of} at ${fig}`, re.test(R.reportState(c2).reachedLine), String(R.reportState(c2).reachedLine)); }
}
ok("page 1 has three tiles: what most sold for (the engine's typical line), the condition, the mileage", demo.desk.evidence.typicalLine && pg[0].includes(demo.desk.evidence.typicalLine) && pg[0].includes("Excellent condition") && v4.tiles.length === 3 && pg[0].includes(rs.mileageWords));
ok("page 1 prints the analyst's why in their own words", !!v4.why && pg[0].includes(v4.why.slice(0, 25)));
ok("the assessment range and the old Valuation heading are gone from every page", !/Valuation|Likely selling price|Your car \$/.test(text) && !text.includes(rs.rangeLine) && !/likely selling price range/i.test(text));
{ const hi = cl(demo); hi.reserve.figure = hi.desk.evidence.q3 + 9000; hi.reserve.sellerRequested = true; hi.desk.reserveCheck = { ...hi.desk.reserveCheck, reserve: hi.reserve.figure, reached: 0, reachedLine: "0 of 18 sales reached this figure.", position: "above", supported: false }; const t = pagesOf(await build(hi))[0], no = cl(hi); no.reserve.sellerRequested = false;
  ok("a reserve above the sales prints only as the seller's request, with the range beside it", /Reserve requested by the seller/i.test(t) && !/Recommended reserve/i.test(t) && t.includes("This is above what recent sales support") && t.includes(money(hi.desk.evidence.q1)) && t.includes(money(hi.desk.evidence.q3)), t.slice(0, 200));
  ok("without the seller's request the label never says requested", !/requested by the seller/i.test(pagesOf(await build(no))[0])); }
{ const st = cl(demo); st.fields.mileage = { ...st.fields.mileage, source: "seller", verified: false }; const vf = cl(demo); vf.fields.mileage = { ...vf.fields.mileage, verified: true };
  ok("a mileage the seller stated reads as reported by the seller until verified, and Verified after", /The seller reports this, not yet verified/.test(pagesOf(await build(st))[0]) && /Verified/.test(pagesOf(await build(vf))[0]) && !/not yet verified/.test(pagesOf(await build(vf))[0])); }
{ const nn = cl(demo); nn.reserve.conditionNote = ""; const wn = cl(demo); wn.reserve.conditionNote = "Stone chips on the nose, visible in the photographs.";
  ok("the condition caveat prints only if the analyst writes one", !pagesOf(await build(nn))[0].includes("Stone chips") && pagesOf(await build(wn))[0].includes("Stone chips on the nose") && /From the information and photographs sent/.test(pagesOf(await build(nn))[0])); }
{ const raw = Buffer.from(fin.bytes).toString("latin1"), st = [...raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(m => m[1]).filter(x => /BT /.test(x))[0], band = [...st.matchAll(/([\d.-]+) ([\d.-]+) ([\d.]+) ([\d.]+) re W n/g)].map(m => ({ w: Number(m[3]), h: Number(m[4]) }))[0];
  ok("the cover photo is a band across the full width and the top half of the page", band && band.w === 612 && band.h >= 340 && band.h <= 400, JSON.stringify(band)); }
// page 2
ok("page 2 heads the strip with the number of real sales and marks the reserve on it", at(1, /^Where the reserve sits among \d+ real sales?$/).length === 1 && at(1, /^Reserve \$[\d,]+$/).length === 1 && at(1, /^Median of \d+ sales$/).length === 1);
ok("page 2 prints the engine's supports and what was taken into account, as the engine worded them", v4.supports.length > 0 && v4.considered.length > 0 && v4.supports.slice(0, 5).every(x => pg[1].includes(x.title) && pg[1].includes(x.text.slice(0, 20))) && demo.desk.supports.slice(0, 5).every(x => pg[1].includes(x.line.slice(0, 20))) && v4.considered.slice(0, 5).every(x => pg[1].includes(x.text.slice(0, 20))) && pg[1].includes("What supports it") && pg[1].includes("What we took into account"));
ok("page 2 shows the seller's chosen photographs with their caption, and none when none are chosen", pg[1].includes("The photographs supplied with the car.") && (() => { const n = cl(demo); n.photos.reportIds = []; return true; })() && !pagesOf(await build((() => { const n = cl(demo); n.photos.reportIds = []; return n; })()))[1].includes("The photographs supplied"));
// page 3
ok("page 3 heading counts the cards in words and says the car, not yours (Four recent sales closest to the car)", !!at(2, /^Four recent sales closest to the car$/).length);
{ const c2 = cl(demo); c2.selectedComparables = pool.slice(0, 2).map(x => x.id); ok("with two selected the heading says Two", mini.pdfTextOps((await build(c2)).bytes)[2].some(o => /^Two recent sales closest to the car$/.test(o.text))); }
ok("each comparable card has its price, venue and month, title and miles, why and a link; a sale with no photo is a text card, never a substitute", pool.every(x => pg[2].includes(money(x.price))) && at(2, /^View the original listing$/).length === 4 && at(2, /^Listing photograph not available for this sale$/).length === 2 && at(2, /·\s+[A-Z][a-z]+ 20\d\d$/).length === 4);
ok("page 3 closes with the engine's own evidence note (period, population, before buyer premium, date updated)", demo.desk.evidence.noteLine && /about this evidence/i.test(pg[2]) && pg[2].includes(demo.desk.evidence.noteLine.slice(0, 16)), String(demo.desk.evidence.noteLine));
// page 4
ok("page 4 sets the analyst's next steps large, numbered, in their order", v4.nextSteps.length > 0 && v4.nextSteps.every((s, i) => at(3, new RegExp("^" + String(i + 1) + "$")).some(o => o.size >= 16) && pg[3].includes(s.slice(0, 20))) && at(3, /^What happens next$/).some(o => o.size >= 20));
ok("listings for sale elsewhere never print, on any page", !/Bid \$|Asking \$|On the market now|Bring a Trailer, 2 days|example\.com\/live/.test(text) && demo.desk.live.length > 0);
{ const all = cl(demo); all.desk.quarters = all.desk.quarters.map(q => ({ ...q, shown: true, median: q.median || 30000 })); const some = cl(demo); some.desk.quarters = some.desk.quarters.map((q, i) => (i === 1 ? { ...q, shown: false, median: null } : q)); const none = cl(demo); none.desk.quarters = [];
  ok("the trend prints only when every quarter has enough sales: all shown yes, one short no, none no", /How prices have moved/.test(pagesOf(await build(all))[3]) && !/How prices have moved/.test(pagesOf(await build(some))[3]) && !/How prices have moved/.test(pagesOf(await build(none))[3]) && /Median sale price by quarter/.test(pagesOf(await build(all))[3]));
  const rects = [...Buffer.from((await build(all)).bytes).toString("latin1").matchAll(/0\.68 0\.8 0\.74 rg ([\d.-]+) ([\d.-]+) ([\d.]+) ([\d.]+) re f/g)]; ok("each trend bar is one quarter's median from the engine, none for a quarter not shown", rects.length === all.desk.quarters.length && !(Buffer.from((await build(some)).bytes).toString("latin1").includes("0.68 0.8 0.74 rg"))); }
ok("the contact block and the reference sit on page 4, and the draft or version line with the date", /Reference /.test(pg[3]) && pg[3].includes("Acme Auctions") && pg[3].includes("Version " + demo.version));
ok("page 4 carries the Please note paragraph, and the no prior record sentence only when the case supports it", /Please note/.test(pg[3]) && !/No prior auction record/.test(text));
{ const c5 = cl(demo); c5.desk.evidence = { ...c5.desk.evidence, asOf: null, insufficient: true, sentence: "There are too few sales to give a reference.", median: null, q1: null, q3: null, noteLine: null }; const t5 = pagesOf(await build(c5));
  ok("with no evidence date and no note there is no Please note heading, and the pages still number four with nothing empty", !/Please note/.test(t5[3]) && t5.length === 4 && t5.every(t => t.length > 200)); }
// the wording follows the case
const docsOut = cl(demo); docsOut.documents[0].status = "outstanding"; const outTxt = pagesOf(await build(docsOut)).join(" ");
ok("the next steps drop the invoices step once received, and the PDF says so", !/Send us the service invoice/.test(text) && /Send us the service invoice/.test(outTxt));
{ const nr = cl(demo); nr.fields.vin = { value: "WP0AA2995XS626785", source: "seller", verified: false, candidates: [] }; nr.record = { appearances: 0, none: "x" }; const t = pagesOf(await build(nr))[3];
  ok("no prior auction record: the one sentence is in the note on page 4, and there is no page for it", /Please note/.test(t) && /No prior auction record for this VIN\./.test(t) && pagesOf(await build(nr)).length === 4); }
ok("without that case there is no such sentence anywhere", !/No prior auction record/.test(pg.join(" ")));
// brand and logo
const colored = await build(demo, { color: "#112233" }), plain = await build(demo, { color: null });
ok("the org's brand colour is used for the figures and marks", Buffer.from(colored.bytes).toString("latin1").includes("0.07 0.13 0.2 rg") && !Buffer.from(plain.bytes).toString("latin1").includes("0.07 0.13 0.2 rg"));
const logo = await build(demo, { logo: "https://real.example/logo.png" }); ok("the org's logo is placed at the top of every page", count(logo, /\/Im\d+ Do/g) === count(fin, /\/Im\d+ Do/g) + 4);
// print safe: nothing outside the margins
{ const s = Buffer.from(fin.bytes).toString("latin1"), xs = [...s.matchAll(/BT \/\w+ [\d.]+ Tf [\d. ]+ rg ([\d.-]+) ([\d.-]+) Td/g)].map(m => [Number(m[1]), Number(m[2])]);
  ok("print safe margins: every text origin sits inside 36 points of the page edge", xs.length > 40 && xs.every(([x, y]) => x >= 36 && x <= 595 - 36 && y >= 36 && y <= 842 - 24), JSON.stringify(xs.filter(([x, y]) => !(x >= 36 && x <= 559 && y >= 36 && y <= 818)).slice(0, 3))); }
// the actions
{ const store = memoryStore(), cx = { org: "t", seat: "crew", store, now: T, env: {}, readSheet: async (e, input) => read(input), fetchImage }, A2 = A;
  await store.insert("t", { id: "d1", owner_seat: "crew", status: "In progress", created_at: T, submission: { typed: false, photos: [{ id: base.photos.items[0].id, url: "https://real.example/cover.jpg" }], documents: [] }, state: {}, case: demo, version: 1 });
  const d = await A2.handleSheetAction("sheet_pdf", { id: "d1", draft: true }, cx);
  ok("sheet_pdf draft on a V3 case returns the four page DRAFT report, with no report number", d.ok && d.draft && d.pages === 4 && d.reportNumber === null && mini.pdfPages(Buffer.from(d.pdf_b64, "base64")).every(p => /DRAFT/.test(p.join(" "))), JSON.stringify(d).slice(0, 120));
  const f = await A2.handleSheetAction("case_finalize", { id: "d1" }, cx), e = await A2.handleSheetAction("sheet_pdf", { id: "d1" }, cx);
  ok("sheet_pdf after case_finalize returns the four page report with its number and no watermark", f.ok && e.ok && e.pages === 4 && e.reportNumber === f.reportNumber && mini.pdfPages(Buffer.from(e.pdf_b64, "base64")).every(p => !/DRAFT/.test(p.join(" ")) && p.join(" ").includes(f.reportNumber)), JSON.stringify(e).slice(0, 160)); }
// ---------- NO RESERVE ON THE COVER (Lane D, Nov 11 2026) ----------
// CAUSE of the work and OTHER CARS: see scripts/reportConsistencyCheck.mjs (no reserve in the report). CLASS here: what the PDF prints equals what the case holds, for every seller answer: with no reserve set the cover prints the headline and the engine's own line in place of the figure, the seller's own answer beside it, and page 2 keeps the figure as the expected result; with the report on a reserve nothing of that is printed.
{ const RW = await imp("lib/reasonWords.js"), SP = await imp("lib/desk/reserveModeLines.js"), money = n => "$" + Number(n).toLocaleString("en-US"), line = SP.speakReserveMode({ recommendation: "no_reserve", line: "stored", withReserve: { count: 12, soldShare: 70, medianLine: "$36,000" }, noReserve: { count: 9, soldShare: 80, medianLine: "$40,000" }, thin: false, thinLine: null }).line;   // the line the table makes from the fixture's figures
  const mk = (mode, pref) => { const c = cl(demo); c.desk.reserveMode = { recommendation: "no_reserve", line, withReserve: { count: 12, soldShare: 70, medianLine: "$36,000" }, noReserve: { count: 9, soldShare: 80, medianLine: "$40,000" }, thin: false, thinLine: null }; c.reserve = { ...c.reserve, sellerPreference: pref }; c.report = { reserveMode: { mode, why: "" } }; return c; };
  const off = []; for (const pref of [null, "yes", "no", "not_sure"]) { const c = mk("no_reserve", pref), p = pagesOf(await build(c)), fig = money(c.reserve.figure), q = pagesOf(await build(mk(null, pref)));
    const prefLine = pref ? RW.reasonLine("case.reserve.seller_preference", { answer: pref }) : null;
    if (!(/recommended: no reserve/i.test(p[0]) && p[0].includes(line) && !p[0].includes(fig))) off.push(`${pref}: the cover is wrong (figure on it: ${p[0].includes(fig)})`);
    if (prefLine ? !p[0].includes(prefLine) : /The seller (would|does not|is not)/.test(p[0])) off.push(`${pref}: the seller's answer is wrong on the cover`);
    if (!p[1].includes(RW.reasonLine("v4.expected_result", { figure: c.reserve.figure }))) off.push(`${pref}: page 2 does not keep the figure as the expected result`);
    if (/recommended: no reserve/i.test(q[0]) || !q[0].includes(fig) || q[1].includes("Expected result")) off.push(`${pref}: the reserve report carries no reserve words or loses its figure`); }
  ok("the cover prints Recommended: no reserve and the engine's line in place of the figure, the seller's answer beside it, the figure on page 2 as the expected result; a reserve report prints none of it (4 seller answers)", !off.length, off.join(" | ")); }
// ---------- THE DESK'S OWN WORD FOR THE REPORT (Lane F's run: the PDF title and the email subject said "Valuation report") ----------
// CAUSE: four places wrote the words in their own strings (both PDF builders, the send's fallback subject, the preview's stand-in) and the default message. OTHER PAGES: the PDF file title, the email subject and message of every send, the preview send. CLASS: the report is called one thing, from one table line (report.name, report.title_final, report.title_draft), and no source that prints a title or a subject writes its own.
{ const RW = await imp("lib/reasonWords.js"), titleOf = r => (Buffer.from(r.bytes).toString("latin1").match(/\/Title \(([^)]*)\)/) || [])[1] || "";
  ok("the PDF's file title (final and draft) is the Desk's word, not valuation", /^Market report DV-/.test(titleOf(fin)) && titleOf(drf) === "Market report DRAFT" && !/valuation/i.test(titleOf(fin) + titleOf(drf)), titleOf(fin) + " | " + titleOf(drf));
  ok("the table line is the one word, with no dash", RW.reasonLine("report.name") === "Market report" && RW.reasonLine("report.title_final", { number: "DV-1" }) === "Market report DV-1");
  const srcs = ["lib/desk/reportPdf.js", "lib/desk/reportPdfV3.js", "lib/desk/sheetActions.js", "lib/desk/send.js", "lib/desk/caseSend.js", "lib/preview/deskPreview.js", "lib/pdf/mini.js"], bad = srcs.filter(f => /["'`][^"'`\n]*valuation report/i.test(fs.readFileSync(path.join(root, f), "utf8").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n")));
  ok("no source that prints a title, a subject or a default message writes valuation report in its own words", !bad.length, bad.join(",")); }
console.log(`deskPdfCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
