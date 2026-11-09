// Each mutation breaks one rule of the four page report (desk v3 stage 4) on a scratch copy; scripts/deskPdfCheck.mjs must go red on every one.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const PV = "lib/desk/reportPdfV3.js", RS = "lib/desk/reportState.js", SA = "lib/desk/sheetActions.js";
const MUT = [
  ["a draft has no watermark", PV, s => s.replace("if (draft) doc.watermark(\"DRAFT\");", "")],
  ["a finalized version carries the watermark", PV, s => s.replace("if (draft) doc.watermark(\"DRAFT\");", "doc.watermark(\"DRAFT\");")],
  ["the page numbers say of 3", PV, s => s.replace("`Page ${n} of 4`", "`Page ${n} of 3`")],
  ["the page number is always 1", PV, s => s.replace("`Page ${n} of 4`", "`Page 1 of 4`")],
  ["the cover ignores the seller's photo", PV, s => s.replace("heroBytes = hero ? await loadImage(hero.url, fetchImage) : null", "heroBytes = null")],
  ["a comparable's photo is never drawn", PV, s => s.replace("const pb = photos[i];", "const pb = null;")],
  ["a text card loses its price", PV, s => s.replace('T(cm.price != null ? moneyWords(cm.price) : "", x + 12', 'T("", x + 12')],
  ["the comparables have no link", PV, s => s.replace("doc.link(x + 12, yy + ch - 26, 90, 14, cm.url);", "")],
  ["any address becomes a link", "lib/pdf/mini.js", s => s.replace("/^https:\\/\\/[^\\s()<>\\\\]+$/", "/^[^\\s]+$/")],
  ["an unshown quarter is printed", RS, s => s.replace("filter(q => q.shown && q.median != null)", "filter(q => q.median != null || true)")],
  ["an empty quarters heading is printed", PV, s => s.replace("if (rs.quarterLines.length) {", "if (true) {")],
  ["an empty live heading is printed", PV, s => s.replace("if (rs.liveLines.length) {", "if (true) {")],
  ["an asking price is labelled a bid", RS, s => s.replace('x.type === "ask" ? "report.live_ask"', 'x.type === "ask" ? "report.live_bid"')],
  ["page 3 prints no comparables", RS, s => s.replace(".slice(0, 4).map(x => ({ id: x.id, title", ".slice(0, 0).map(x => ({ id: x.id, title")],
  ["the org's colour is ignored", PV, s => s.replace("accentOf((fin.org && fin.org.color) || org.color)", "accentOf(null)")],
  ["the footer has no version", PV, s => s.replace('draft ? "Draft preview" : `Version ${c.version}`', 'draft ? "Draft preview" : ""')],
  ["the reserve box prints the assessment figure", PV, s => s.replace('c.reserve.figure != null ? moneyWords(c.reserve.figure) : "Not set"', 'c.assessment.figure != null ? moneyWords(c.assessment.figure) : "Not set"')],
  ["the margins are 20 points", PV, s => s.replace("const M = 54, TOP = 70;", "const M = 20, TOP = 70;")],
  ["the report has no strengths column", PV, s => s.replace("for (const l of rs.strengths.slice(0, 6))", "for (const l of [])")],
  ["a case sheet is exported with the old ten part builder", SA, s => s.replace("const rep = sheet.case ? await (await import(\"./reportPdfV3.js\"))", "const rep = false ? await (await import(\"./reportPdfV3.js\"))")],
  ["a case sheet's draft needs the old read", SA, s => s.replace("if (sheet.case) {   // DESK V3: the four page report", "if (false) {   // DESK V3: the four page report")],
  ["the note prints even with nothing to say", PV, s => s.replace("if (rs.noteLines.length) {", "if (true) {")],
  ["the report is written with the standard fonts (no embed)", PV, s => s.replace("new Doc({ embed: reportFonts(), w: W, h: H, title:", "new Doc({ w: W, h: H, title:")],
  ["the writer adds the standard fonts beside the embedded ones", "lib/pdf/mini.js", s => s.replace("    } else for (const [k, n] of Object.entries(FONTS))", "    } for (const [k, n] of Object.entries(FONTS))")],
  ["the font file is not embedded", "lib/pdf/mini.js", s => s.replace(" /FontFile2 ${file} 0 R >>`);", " >>`);")],
  ["the subset holds no glyphs", "lib/pdf/ttf.js", s => s.replace("if (want.has(g)) {", "if (false && want.has(g)) {")],
  ["the text is cleaned to plain quotes before it is set", "lib/pdf/mini.js", s => s.replace("(measure ? String(text == null ? \"\" : text) : clean(text))", "clean(text)")],
  ["the footer names the analyst", PV, s => s.replace("`Prepared by ${orgName}`", "`Prepared by ${sheet.owner_seat}`")],
  ["the file's metadata carries the analyst's seat", PV, s => s.replace("keywords: draft ? `draft; org=${orgName}` : `report=${number}; version=${c.version}; org=${orgName}`", "keywords: `seat=${sheet.owner_seat}; org=${orgName}`")],
  ["the paper is always A4", PV, s => s.replace('String(org.paper || "").toLowerCase() === "a4" ? "a4" : "letter"', '"a4"')],
  ["the paper is always Letter", PV, s => s.replace('String(org.paper || "").toLowerCase() === "a4" ? "a4" : "letter"', '"letter"')],
  ["the contact block prints the mail sending address", PV, s => s.replace("org.contactPhone, org.contactEmail].filter(Boolean)", "org.contactPhone, org.contactEmail, org.sendingAddress].filter(Boolean)")],
  ["the contact block leaves out the address", PV, s => s.replace("[orgName, org.contactAddress, org.contactPhone, org.contactEmail]", "[orgName, org.contactPhone, org.contactEmail]")],
  ["a draft footer says Version, not Draft preview", PV, s => s.replace('draft ? "Draft preview" : `Version ${c.version}`', '`Version ${c.version}`')],
  ["the footer rule does not move with the paper (fixed at 790)", PV, s => s.replace("FOOT = H - 52;", "FOOT = 790;")],
  ["a case_pdf draft records an export", SA, s => s.replace("      const rep = await buildReportV3(await minted(ctx, org, s0), set, { fetchImage: ctx.fetchImage, draft: true });\n      return { ok: true, draft: true, filename: rep.filename, reportNumber: null, version", "      const rep = await buildReportV3(await minted(ctx, org, s0), set, { fetchImage: ctx.fetchImage, draft: true }); await store.addExport(org, s0.id, { at: now, seat, kind: \"pdf\", version: s0.case.version });\n      return { ok: true, draft: true, filename: rep.filename, reportNumber: null, version")],
  ["a case_pdf draft carries a report number", SA, s => s.replace("draft: true, filename: rep.filename, reportNumber: null, version: s0.case.version", "draft: true, filename: rep.filename, reportNumber: s0.final ? s0.final.reportNumber : \"DV-2026-0001\", version: s0.case.version")],
  ["case_pdf draft false returns a draft", SA, s => s.replace("const rep = await buildReportV3(await minted(ctx, org, fin), set, { fetchImage: ctx.fetchImage });", "const rep = await buildReportV3(await minted(ctx, org, fin), set, { fetchImage: ctx.fetchImage, draft: true });")],
  ["the finalized case_pdf export is not recorded", SA, s => s.replace('try { await store.addExport(org, fin.id, { at: now, seat, reportNumber: fin.final.reportNumber, kind: "pdf", version: fin.case.version, detail: null }); } catch', "try { } catch")],
  ["a revision's draft false does not find the finalized version it corrects", SA, s => s.replace("while (fin && !fin.final && fin.corrects && guard++ < 50) fin = await get(fin.corrects);", "")],
  ["case_pdf ignores the monthly cap", SA, s => s.replace("if (used >= (Number(set.monthlyExportCap) || 200)) return refuse(\"The monthly export limit for your organisation is reached.\");\n    const rep = await buildReportV3(await minted(ctx, org, fin)", "const rep = await buildReportV3(await minted(ctx, org, fin)")],
  ["another seat exports the finalized report", SA, s => s.replace('if (accessOf(fin, seat).role !== "owner") return refuse(`Only ${fin.owner_seat} can export this report.`);', "")],
  ["a seat may run case_ actions at the door", "api/desk.js", s => s.replace('!act.startsWith("sheet_")', '!(act.startsWith("sheet_") || act.startsWith("case_"))')],
  ["the handler no longer routes case_ actions", "lib/desk/handler.js", s => s.replace('body.action.startsWith("case_")', 'body.action.startsWith("kase_")')],
  ["the logo is not placed", PV, s => s.replace("if (logo) { const b = await loadImage(logo, fetchImage);", "if (false) { const b = await loadImage(logo, fetchImage);")]
];
function copyTree(dst) { for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) }); for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f)); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules")); }
let bad = 0;
for (const [i, [name, file, fn]] of MUT.entries()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; }
  else { fs.writeFileSync(p, after); let red = false; try { execFileSync("node", [`scripts/deskPdfCheck.mjs`, dir], { cwd: dir, stdio: "pipe", timeout: 120000 }); } catch { red = true; } console.log((red ? "ok  " : "FAIL") + `  [${i}] deskPdfCheck goes red without the rule: ` + name); if (!red) bad++; }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`deskPdfFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
