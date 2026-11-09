// DESK V3 WIRE (Lane E, Nov 8 2026). Every number and sentence the demonstration case shows on the summary, the sticky bar and the tabs traces to a field the server sent: desk.* (the block lib/deskV3.js builds),
// market.meter (built from desk.evidence) or the case's own fields (Lane D: the analyst's figures and lines). A typed sentence, a figure the page made (arithmetic) or a figure no field carries fails.
//   node scripts/deskV3WireCheck.mjs      (offline; the mutants must be caught)
import fs from "node:fs";
import { demoHtml, V3, FX, RW, CN, CV, tally } from "./deskV3Harness.mjs";
const { ok, done } = tally(), html = await demoHtml(), kase = await FX.demoCaseRecord(), desk = kase.desk;
const main = h => (h.match(/<main class="work"[\s\S]*<\/main>/) || [""])[0] + (h.match(/<nav class="rail"[\s\S]*?<\/nav>/) || [""])[0];
const text = h => main(h).replace(/<[^>]*>/g, "\n").replace(/&amp;/g, "&").replace(/&quot;/g, '"').split("\n").map(x => x.trim()).filter(Boolean);
// the fields: every string and number a sent field carries (the case record, Lane B's desk block on it, the case view's handling lines), formatted only by the engine's own word module
const strings = new Set(), figs = new Set();
const walk = o => { if (o == null) return; if (typeof o === "string") strings.add(o); else if (typeof o === "number") { figs.add(RW.moneyWords(o)); strings.add(String(o)); } else if (Array.isArray(o)) o.forEach(walk); else if (typeof o === "object") Object.values(o).forEach(walk); };
walk(kase);
{ const PV = await import("../lib/preview/deskPreview.js"); const store = await PV.previewStore(); await V3.renderDeskV3({ query: {} }); const rows = await store.list(PV.PREVIEW_ORG.id); const cv = CV.caseView(rows[0], rows, new Date().toISOString()); walk(cv.handling); walk(cv.queue); for (const r of rows) { walk(r.car_label); walk(r.submission && r.submission.consignor && r.submission.consignor.name); walk(r.id); } }   // the rail's cases and the operations lines as the server sent them
const ev = desk.evidence, as = kase.assessment, M = RW.moneyWords;
const allowedSentence = new Set([...strings, `Typical ${M(ev.q1)} to ${M(ev.q3)}`, `${M(as.low)} to ${M(as.high)}`, `${CN.countNoun(ev.count, "sale", { words: false })} · evidence as of ${ev.asOf}`]);
// labels the page prints that are names of things, not claims: the shell's own words, the field names, the source names, the action names
const LABELS = new Set(["Market reference", "Analyst assessment", "Proposed reserve", "Needs review", "Vehicle", "Market evidence", "Decision", "Assessment", "Reserve", "Market", "Review", "Low", "High", "Stale", "lowest", "q1", "median", "q3", "highest", "reserve", "asking", "Demonstration case", "Seller", "Lead ref", "Submitted", "Status", "Not set", "Nothing open", "Vehicle facts", "Photos", "Documents", "Edit", "Report", "Cover", "Make cover", "Add photos", "Close", "Not provided", "Mark verified", "Invoices received", "Request and proceed", "No documents.", "Nothing to review.", "Operations", "Search cases", "New leads", "In review", "Ready for report", "Finalized", "No case matches.", "Select a case from the list.", ...Object.values(V3.FIELD_LABEL), ...Object.values(V3.SRC_LABEL), "open", "done", "waived", "outstanding", "received"]);
function trace(h) {
  const bad = [], t = text(h);
  for (const line of t) {
    if (LABELS.has(line)) continue;
    const dollars = line.match(/\$[\d,]+/g) || [];
    for (const d of dollars) if (!figs.has(d)) bad.push(`a figure no field carries: ${d} in "${line}"`);
    if (/^\$[\d,]+$/.test(line) || LABELS.has(line)) continue;
    const parts = line.split(" · ");
    if (allowedSentence.has(line)) continue;
    if (/^[\w:.-]+$/.test(line) || /^[A-Z0-9]{17}$/.test(line)) continue;   // an id or a VIN as sent
    if (/^\d{4}-\d{2}-\d{2}$/.test(line) || /^\d+ (min|h|d)$/.test(line) || /^(New|In progress|Finalised|Sent|Needs the car)$/.test(line)) continue;
    bad.push(`a sentence no field carries: "${line}"`);
  }
  // the inputs carry the case's own figures
  const vals = [...h.matchAll(/<input id="in-[a-z]+" [^>]*value="([^"]*)"/g)].map(m => m[1]);
  for (const v of vals) if (v && !strings.has(v)) bad.push(`an input value no field carries: ${v}`);
  return bad;
}
const real = trace(html); for (const b of real) ok(false, b); ok(!real.length, "every figure, sentence and input value on the demonstration case traces to desk.*, market.meter or the case's fields");
{ const sc = html.match(/class="mk mk-\w+[^"]*" style="[^"]*" data-v="(\d+)"/g) || []; ok(sc.length >= 5, "the position bar labels its marks"); const dv = [...html.matchAll(/data-v="(\d+)"/g)].map(m => Number(m[1])); ok(dv.every(v => figs.has(M(v))), "every mark on the bar is a sent figure"); }
{ const src = fs.readFileSync("lib/preview/deskV3.js", "utf8"); ok(!/Math\.|\*\s*0\.\d|\/\s*100/.test(src.replace(/\/\/.*$/gm, "")), "deskV3.js makes no figure (the bar's positions are drawn in deskV3Bar.js, which prints only sent figures)"); }
const res = kase.reserve.figure, nd = kase.needs_review[0].label;
const MUT = [
  ["a figure the page made (median plus 500)", h => h.split(M(ev.median)).join(M(ev.median + 500))],
  ["a typed sentence in Needs review", h => h.replace(nd, "Mileage is probably fine.")],
  ["a typed stale sentence", h => h.replace("</section><div class=\"tabs3\"", "<p class=\"fg-s\">This evidence is more than ninety days old.</p></section><div class=\"tabs3\"")],
  ["a typed sale count", h => h.replace(CN.countNoun(ev.count, "sale", { words: false }), "12 sales")],
  ["a typed reserve input", h => h.replace(`id="in-reserve" type="text" inputmode="numeric" value="${res}"`, 'id="in-reserve" type="text" inputmode="numeric" value="99999"')],
  ["a difference computed on the page", h => h.replace("</section><div class=\"tabs3\"", `<p class=\"fg-s\">The reserve sits ${M(ev.median - res)} below the median.</p></section><div class=\"tabs3\"`)],
  ["a typed fact in the vehicle table", h => h.replace("Seller reports the IMS bearing was replaced", "Fully documented, no accidents")],
  ["a typed source label", h => h.replace(">VIN decoded<", ">Verified by the analyst<")],
];
for (const [n, fn] of MUT) ok(trace(fn(html)).length > 0, "mutant caught: " + n);
done("deskV3WireCheck");
