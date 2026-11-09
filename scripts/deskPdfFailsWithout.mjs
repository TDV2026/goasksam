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
  ["a text card loses its price", PV, s => s.replace("T(usd(cm.price), x + 12, ty + 22", "T(\"\", x + 12, ty + 22")],
  ["the comparables have no link", PV, s => s.replace("doc.link(x + 12, yy + ch - 26, 90, 14, cm.url);", "")],
  ["any address becomes a link", "lib/pdf/mini.js", s => s.replace("/^https:\\/\\/[^\\s()<>\\\\]+$/", "/^[^\\s]+$/")],
  ["an unshown quarter is printed", RS, s => s.replace("filter(q => q.shown && q.median != null)", "filter(q => q.median != null || true)")],
  ["an empty quarters heading is printed", PV, s => s.replace("if (rs.quarterLines.length) {", "if (true) {")],
  ["an empty live heading is printed", PV, s => s.replace("if (rs.liveLines.length) {", "if (true) {")],
  ["an asking price is labelled a bid", RS, s => s.replace('x.type === "ask" ? "report.live_ask"', 'x.type === "ask" ? "report.live_bid"')],
  ["page 3 prints no comparables", RS, s => s.replace(".slice(0, 4).map(x => ({ id: x.id, title", ".slice(0, 0).map(x => ({ id: x.id, title")],
  ["the org's colour is ignored", PV, s => s.replace("accentOf((fin.org && fin.org.color) || org.color)", "accentOf(null)")],
  ["the footer has no version", PV, s => s.replace(", `Version ${c.version}`].filter(Boolean).join(\"   \")", "].filter(Boolean).join(\"   \")")],
  ["the reserve box prints the assessment figure", PV, s => s.replace("c.reserve.figure != null ? usd(c.reserve.figure) : \"Not set\"", "c.assessment.figure != null ? usd(c.assessment.figure) : \"Not set\"")],
  ["the margins are 20 points", PV, s => s.replace("const M = 54, W = 595", "const M = 20, W = 595")],
  ["the report has no strengths column", PV, s => s.replace("for (const l of rs.strengths.slice(0, 6))", "for (const l of [])")],
  ["a case sheet is exported with the old ten part builder", SA, s => s.replace("const rep = sheet.case ? await (await import(\"./reportPdfV3.js\"))", "const rep = false ? await (await import(\"./reportPdfV3.js\"))")],
  ["a case sheet's draft needs the old read", SA, s => s.replace("if (sheet.case) {   // DESK V3: the four page report", "if (false) {   // DESK V3: the four page report")],
  ["the note prints even with nothing to say", PV, s => s.replace("if (rs.noteLines.length) {", "if (true) {")],
  ["the report is written with the standard fonts (no embed)", PV, s => s.replace("new Doc({ embed: reportFonts(), title:", "new Doc({ title:")],
  ["the writer adds the standard fonts beside the embedded ones", "lib/pdf/mini.js", s => s.replace("    } else for (const [k, n] of Object.entries(FONTS))", "    } for (const [k, n] of Object.entries(FONTS))")],
  ["the font file is not embedded", "lib/pdf/mini.js", s => s.replace(" /FontFile2 ${file} 0 R >>`);", " >>`);")],
  ["the subset holds no glyphs", "lib/pdf/ttf.js", s => s.replace("if (want.has(g)) {", "if (false && want.has(g)) {")],
  ["the text is cleaned to plain quotes before it is set", "lib/pdf/mini.js", s => s.replace("(measure ? String(text == null ? \"\" : text) : clean(text))", "clean(text)")],
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
