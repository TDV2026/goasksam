// Each mutation breaks one rule of the four page report (desk v3 stage 4) on a scratch copy; scripts/deskPdfCheck.mjs must go red on every one.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const PV = "lib/desk/reportPdfV3.js", RS = "lib/desk/reportState.js", SA = "lib/desk/sheetActions.js";
const MUT = [
  ["the strip's median label prints the market figure", "lib/desk/reportState.js", s => s.replace('reasonLine("report.strip_median_words", { sales: countNoun(ev.count, "sale", { words: false }) })', 'reasonLine("report.strip_median", { figure: ev.median })')],
  ["a draft has no watermark", PV, s => s.replace("if (draft) doc.watermark(\"DRAFT\");", "")],
  ["a finalized version carries the watermark", PV, s => s.replace("if (draft) doc.watermark(\"DRAFT\");", "doc.watermark(\"DRAFT\");")],
  ["the page numbers say of 3", PV, s => s.replace("`Page ${n} of 4`", "`Page ${n} of 3`")],
  ["the page number is always 1", PV, s => s.replace("`Page ${n} of 4`", "`Page 1 of 4`")],
  ["the cover ignores the seller's photo", PV, s => s.replace("heroBytes = hero ? await loadImage(hero.url, fetchImage) : null", "heroBytes = null")],
  ["any address becomes a link", "lib/pdf/mini.js", s => s.replace("/^https:\\/\\/[^\\s()<>\\\\]+$/", "/^[^\\s]+$/")],
  ["page 3 prints no comparables", RS, s => s.replace(".slice(0, 4).map(x => ({ id: x.id, title", ".slice(0, 0).map(x => ({ id: x.id, title")],
  ["the org's colour is ignored", PV, s => s.replace("accentOf((fin.org && fin.org.color) || org.color)", "accentOf(null)")],
  ["the footer has no version", PV, s => s.replace('draft ? "Draft preview" : `Version ${c.version}`', 'draft ? "Draft preview" : ""')],
  ["a case sheet is exported with the old ten part builder", SA, s => s.replace("const rep = sheet.case ? await (await import(\"./reportPdfV3.js\"))", "const rep = false ? await (await import(\"./reportPdfV3.js\"))")],
  ["a case sheet's draft needs the old read", SA, s => s.replace("if (sheet.case) {   // DESK V3: the four page report", "if (false) {   // DESK V3: the four page report")],
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
  ["a draft footer says Version, not Draft preview", PV, s => s.replace('draft ? "Draft preview" : `Version ${c.version}`', '`Version ${c.version}`')],
  ["the footer rule does not move with the paper (fixed at 790)", PV, s => s.replace("FOOT = H - 52;", "FOOT = 790;")],
  ["a case_pdf draft records an export", SA, s => s.replace("      const rep = await buildReportV3(await minted(ctx, org, asCase), set, { fetchImage: ctx.fetchImage, draft: true });\n      return { ok: true, draft: true, filename: rep.filename, reportNumber: null, version", "      const rep = await buildReportV3(await minted(ctx, org, s0), set, { fetchImage: ctx.fetchImage, draft: true }); await store.addExport(org, s0.id, { at: now, seat, kind: \"pdf\", version: asCase.case.version });\n      return { ok: true, draft: true, filename: rep.filename, reportNumber: null, version")],
  ["a case_pdf draft carries a report number", SA, s => s.replace("draft: true, filename: rep.filename, reportNumber: null, version: asCase.case.version", "draft: true, filename: rep.filename, reportNumber: s0.final ? s0.final.reportNumber : \"DV-2026-0001\", version: asCase.case.version")],
  ["case_pdf draft false returns a draft", SA, s => s.replace("const rep = await buildReportV3(await minted(ctx, org, fin), set, { fetchImage: ctx.fetchImage });", "const rep = await buildReportV3(await minted(ctx, org, fin), set, { fetchImage: ctx.fetchImage, draft: true });")],
  ["the finalized case_pdf export is not recorded", SA, s => s.replace('try { await store.addExport(org, fin.id, { at: now, seat, reportNumber: fin.final.reportNumber, kind: "pdf", version: fin.case.version, detail: null }); } catch', "try { } catch")],
  ["a revision's draft false does not find the finalized version it corrects", SA, s => s.replace("while (fin && !fin.final && fin.corrects && guard++ < 50) fin = await get(fin.corrects);", "")],
  ["case_pdf ignores the monthly cap", SA, s => s.replace("if (used >= (Number(set.monthlyExportCap) || 200)) return refuse(reasonLine(\"send.refuse.cap\"));\n    const rep = await buildReportV3(await minted(ctx, org, fin)", "const rep = await buildReportV3(await minted(ctx, org, fin)")],
  ["another seat exports the finalized report", SA, s => s.replace('if (accessOf(fin, seat).role !== "owner") return refuse(`Only ${fin.owner_seat} can export this report.`);', "")],
  ["a seat may run case_ actions at the door", "api/desk.js", s => s.replace('!act.startsWith("sheet_")', '!(act.startsWith("sheet_") || act.startsWith("case_"))')],
  ["the handler no longer routes case_ actions", "lib/desk/handler.js", s => s.replace('body.action.startsWith("case_")', 'body.action.startsWith("kase_")')],
  ["a comparable's photo is never drawn", PV, s => s.replace("if (photos[i] && doc.imageCover(", "if (false && doc.imageCover(")],
  ["a card loses its price", PV, s => s.replace("T(moneyWords(cm.price), x, ty2 + 17,", 'T("", x, ty2 + 17,')],
  ["the comparables have no link", PV, s => s.replace("if (cm.url) { T(rs.viewListing", "if (false) { T(rs.viewListing")],
  ["the margins are 20 points", PV, s => s.replace("const M = 44, TOP = 76;", "const M = 20, TOP = 76;")],
  ["the contact block leaves out the address", PV, s => s.replace("[org.contactAddress, org.contactPhone, org.contactEmail]", "[org.contactPhone, org.contactEmail]")],
  ["the logo is not placed", PV, s => s.replace("if (logoBytes && doc.image(logoBytes, M, 28, 96, 20)) {}", "if (false && doc.image(logoBytes, M, 28, 96, 20)) {}")],
  ["a card's date is the full day", RS, s => s.replace("x.monthYear = monthYear(x.date);", "x.monthYear = x.date;")],
  ["the link text is View the listing", "lib/reasonWords.js", s => s.replace('() => "View the original listing"', '() => "View the listing"')],
  ["a reserve above the sales is labelled recommended, not the seller's request", RS, s => s.replace('reasonLine(above && asked ? "v4.label_requested" : "v4.label_reserve")', 'reasonLine("v4.label_reserve")')],
  ["a reserve above the sales has no range beside it", RS, s => s.replace('above && ev && !ev.insufficient && ev.q1 != null ? reasonLine("v4.above", { q1: ev.q1, q3: ev.q3 }) : ', "")],
  ["the count of sales that reached the reserve is not printed", PV, s => s.replace("if (v.reachedLine) yr2 =", "if (false) yr2 =")],
  ["the figure is set small", PV, s => s.replace('{ font: "serifb", size: 38, color: ACC }', '{ font: "serifb", size: 14, color: ACC }')],
  ["page 1 prints the assessment range again", PV, s => s.replace("  foot(1);\n", "  y = para(rs.rangeLine, M, y + 4, W - 2 * M); foot(1);\n")],
  ["a mileage the seller stated reads verified", RS, s => s.replace('reasonLine(m.verified ? "v4.tile_miles_verified" : m.source === "seller" ? "v4.tile_miles_stated" : "v4.tile_miles_unconfirmed")', 'reasonLine("v4.tile_miles_verified")')],
  ["the analyst's condition note is never printed", RS, s => s.replace("label: cnote || reasonLine(", "label: reasonLine(")],
  ["a condition caveat the analyst did not write is printed", RS, s => s.replace("label: cnote || reasonLine(\"v4.tile_condition_default\")", "label: cnote || \"Condition is a review category and not a precise grade.\"")],
  ["the title is the typed fields, not the engine's", RS, s => s.replace("title: d.titleLine || ", "title: ")],
  ["the trend prints with a quarter that has too few sales", RS, s => s.replace("qAll.every(q => q.shown && q.median != null)", "qAll.some(q => q.shown && q.median != null)")],
  ["a listing for sale elsewhere is printed", PV, s => s.replace("  foot(4);\n", "  for (const r of rs.liveRows) T(r.right + \" \" + r.left, M, FOOT - 30, { font: \"sans\", size: 8 });\n  foot(4);\n")],
  ["the seller's photographs are not placed", PV, s => s.replace("if (got.length && y + 110 < FOOT)", "if (false)")],
  ["the reserve is not marked on the dots", RS, s => s.replace("labels: { ...out.strip.labels, range: null }", "labels: { ...out.strip.labels, range: null, reserve: null }")],
  ["a sale with no photo borrows the cover picture", PV, s => s.replace("{ doc.rect(x, yy, cw, ih, { fill: [0.87, 0.92, 0.89] });", "{ if (heroBytes) doc.imageCover(heroBytes, x, yy, cw, ih); doc.rect(x, yy, cw, ih, { fill: [0.87, 0.92, 0.89] });")],
  ["the engine's evidence note is missing from page 3", RS, s => s.replace("aboutLine: ev && !ev.insufficient && ev.noteLine ? ev.noteLine : null", "aboutLine: null")],
  ["the next steps are set small", PV, s => s.replace('{ font: "serifb", size: 17, color: ACC }', '{ font: "serifb", size: 9, color: ACC }')],
  ["page 3 says Four whatever the count", RS, s => s.replace('reasonLine("v4.comps_heading", { sales: countNoun(cmps.length, "recent sale", { cap: true }) })', 'reasonLine("v4.comps_heading", { sales: "Four recent sales" })')],
  ["the supports column is empty", PV, s => s.replace("for (const it of v.supports.slice(0, 5))", "for (const it of v.supports.slice(0, 0))")],
  ["the Please note prints with nothing to say", PV, s => s.replace("if (v.pleaseNote.length) {", "if (true) {")],
  ["the cover photo is a small picture, not the band", PV, s => s.replace("doc.imageCover(heroBytes, 0, 0, W, heroH)", "doc.imageCover(heroBytes, 0, 0, W / 3, heroH / 3)")],
  ["a case's own what-supports line is dropped in favour of a typed one", RS, s => s.replace("supports: (d.supports || []).map(x => ({ title: x.title, text: x.line }))", "supports: (d.supports || []).map(x => ({ title: x.title, text: \"Supports the reserve.\" }))")],
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
