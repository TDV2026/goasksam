// DESK V3 WIRE (Lane E, Nov 8 2026). Every number and sentence the demonstration case shows on the summary, the sticky bar and the tabs traces to a field the server sent: desk.* (the block lib/deskV3.js builds),
// market.meter (built from desk.evidence) or the case's own fields (Lane D: the analyst's figures and lines). A typed sentence, a figure the page made (arithmetic) or a figure no field carries fails.
//   node scripts/deskV3WireCheck.mjs      (offline; the mutants must be caught)
import fs from "node:fs";
import { demoHtml, V3, FX, RW, CN, CV, tally } from "./deskV3Harness.mjs";
const esc2 = x => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"), { ok, done } = tally(), html = await demoHtml(), kase = await FX.demoCaseRecord(), desk = kase.desk;
const main = h => (h.match(/<main class="work"[\s\S]*<\/main>/) || [""])[0] + (h.match(/<nav class="rail"[\s\S]*?<\/nav>/) || [""])[0];
const text = h => main(h).replace(/<[^>]*>/g, "\n").replace(/&amp;/g, "&").replace(/&quot;/g, '"').split("\n").map(x => x.trim()).filter(Boolean);
// the fields: every string and number a sent field carries (the case record, Lane B's desk block on it, the case view's handling lines), formatted only by the engine's own word module
const strings = new Set(), figs = new Set(); let DEMO_CV = null;
const walk = o => { if (o == null) return; if (typeof o === "string") strings.add(o); else if (typeof o === "number") { figs.add(RW.moneyWords(o)); strings.add(String(o)); if (Number.isInteger(o) && o >= 0 && o < 100000) strings.add(CN.countNoun(o, "sale", { words: false })); } else if (Array.isArray(o)) o.forEach(walk); else if (typeof o === "object") Object.values(o).forEach(walk); };
walk(kase); walk((await import("../lib/desk/caseWorkflow.js")).readinessOf(kase));   // Lane D's readiness sentences
const TL = (await import("../lib/conditionTier.js")).TIER_LADDER;
{ const PV = await import("../lib/preview/deskPreview.js"); const store = await PV.previewStore(); await V3.renderDeskV3({ query: {} }); const rows = await store.list(PV.PREVIEW_ORG.id); const cv = CV.caseView(rows[0], rows, new Date().toISOString()); DEMO_CV = CV.caseView(rows.find(r => r.id === V3.DEMO_ID), rows, new Date().toISOString()); walk(DEMO_CV); walk(cv.handling); walk(cv.queue); for (const r of rows) { walk(r.car_label); walk(r.submission && r.submission.consignor && r.submission.consignor.name); walk(r.id); } }   // the rail's cases and the operations lines as the server sent them
walk(DEMO_CV);   // what the stored case says now (Lane D's f02b6032 takes the assessment from the engine when a case opens, and logs it)
const ev = desk.evidence, as = kase.assessment, M = RW.moneyWords;
const auditLine = x => `${x.what}${x.field ? " " + x.field : ""}${x.from != null || x.to != null ? ": " + (x.from == null ? "" : x.from) + (x.from != null && x.to != null ? " to " : "") + (x.to == null ? "" : x.to) : ""}`;   // the page joins an audit line from the sent what, field, from and to, never a word of its own
for (const x of (DEMO_CV.audit || [])) strings.add(auditLine(x));
const allowedSentence = new Set([...strings, `Typical ${M(ev.q1)} to ${M(ev.q3)}`, `${M(as.low)} to ${M(as.high)}`, `${CN.countNoun(ev.count, "sale", { words: false })} · evidence as of ${ev.asOf}`, `Market: typical ${M(ev.q1)} to ${M(ev.q3)} · ${CN.countNoun(ev.count, "sale", { words: false })} · evidence as of ${ev.asOf}`]);   // the market line under the one big figure
// labels the page prints that are names of things, not claims: the shell's own words, the field names, the source names, the action names
const LABELS = new Set(["New case", "Create case", "Cancel", "Asking price", "Seller notes", "Seller name", "Photos", "Range low (optional)", "Range high (optional)", "Valuation", "Enter the car: a VIN, or the year, make and model. Everything else is optional.", "Report preview", "Close preview", "Against the reference", "Seller agreed", "Report readiness", "Save draft", "Preview report", "Finalize", "Explanation", "Rationale", "Condition", "Factors", "Audit trail", "Ready", "Difference", ...Object.values(V3.VERIFY_LABEL), ...[1, 2, 3, 4].map(t => TL[t].name), "Evidence", "Comparables", "By quarter", "Current listings", "Outside the population", "Original engine result", "Current selected set", "Median", "Typical range", "Lowest to highest", "Sales", "Matching", "Period", "Latest sale", "Reference", "View sale", "View listing", "Exclude", "In report", "Why", "Scope", ...Object.values(V3.SCOPE_LABEL), ...Object.values(V3.REL_LABEL), ...Object.values(V3.LIVE_LABEL), "Market reference", "Analyst assessment", "Proposed reserve", "Needs review", "Vehicle", "Market evidence", "Decision", "Assessment", "Reserve", "Market", "Review", "Low", "High", "Stale", "lowest", "q1", "median", "q3", "highest", "reserve", "asking", "Demonstration case", "Seller", "Lead ref", "Submitted", "Status", "Not set", "Nothing open", "Vehicle facts", "Photos", "Documents", "Edit", "Report", "Cover", "Make cover", "Add photos", "Close", "Not provided", "Mark verified", "Invoices received", "Request and proceed", "No documents.", "Nothing to review.", "Operations", "Search cases", "New leads", "In review", "Ready for report", "Finalized", "No case matches.", "Select a case from the list.", ...Object.values(V3.FIELD_LABEL), ...Object.values(V3.SRC_LABEL), "open", "done", "waived", "outstanding", "received"]);
function trace(h) {
  const bad = [], t = text(h);
  for (const line of t) {
    if (LABELS.has(line)) continue;
    if (allowedSentence.has(line)) continue;   // a sentence or figure line the server sent whole
    // a line the page joins from sent parts: " · " between parts, " to " between two figures; every part must itself be sent
    const parts = line.split(" · "); let okLine = true;
    for (const part of parts) {
      const rng = /^(\$[\d,]+) to (\$[\d,]+)$/.exec(part), ok1 = x => figs.has(x) || strings.has(x) || /^\d{4}-\d{2}-\d{2}$/.test(x);
      if (!(rng ? figs.has(rng[1]) && figs.has(rng[2]) : /^\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/.test(part) || ok1(part) || LABELS.has(part))) okLine = false;
    }
    if (okLine) continue;
    for (const d of line.match(/\$[\d,]+/g) || []) if (!figs.has(d)) bad.push(`a figure no field carries: ${d} in "${line}"`);
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
{ const src = fs.readFileSync("lib/preview/deskV3.js", "utf8"); ok(!/Math\.|\*\s*0\.\d|\/\s*100/.test(src.replace(/\/\/ DRAG_JS_BEGIN[\s\S]*?\/\/ DRAG_JS_END/, "").replace(/\/\/.*$/gm, "")), "deskV3.js makes no figure outside the marker block (the bar's positions are drawn in deskV3Bar.js, which prints only sent figures)"); }
{ const diff = DEMO_CV.assessment.differenceLine, pos = DEMO_CV.reserve.positionLine, mi = DEMO_CV.vehicle.mileageLine, n = (h, x) => h.split(x).length - 1;
  ok(!!diff && !!pos && !!mi, "Lane D's three fields are on the case view (assessment.differenceLine, reserve.positionLine, vehicle.mileageLine)");
  ok(n(html, esc2(diff)) >= 1 && !/<section class="sum"[\s\S]*?<\/section>/.exec(html)[0].includes(esc2(diff)), "the difference line is printed on the Decision tab, as sent, and not in the header (one figure there)");
  ok(n(html, esc2(pos)) >= 1 && !/<section class="sum"[\s\S]*?<\/section>/.exec(html)[0].includes(esc2(pos)) && !/<div class="stk"[\s\S]*?<\/div>\s*<section/.exec(html)[0].includes("Reserve"), "the position line is printed on the Decision tab, as sent, and no reserve is in the header or the sticky bar");
  ok(/<p class="chd-spec">[^<]*/.exec(html)[0].includes(mi) && n(html, ">" + mi + "<") >= 1, "the mileage line is printed in the header and in the facts, as sent"); }
const res = kase.reserve.figure, nd = kase.needs_review[0].label;
const MUT = [
  ["a figure the page made (median plus 500)", h => h.split(M(ev.median)).join(M(ev.median + 500))],
  ["a typed sentence in Needs review", h => h.replace(nd, "Mileage is probably fine.")],
  ["a typed stale sentence", h => h.replace("</section><div class=\"tabs3\"", "<p class=\"fg-s\">This evidence is more than ninety days old.</p></section><div class=\"tabs3\"")],
  ["a typed sale count", h => h.replace(CN.countNoun(ev.count, "sale", { words: false }), "12 sales")],
  ["a typed reserve input", h => h.replace(`id="in-reserve" type="text" inputmode="numeric" value="${res}"`, 'id="in-reserve" type="text" inputmode="numeric" value="99999"')],
  ["a difference computed on the page", h => h.replace("</section><div class=\"tabs3\"", `<p class=\"fg-s\">The reserve sits ${M(ev.median - res)} below the median.</p></section><div class=\"tabs3\"`)],
  ["a typed fact in the vehicle table", h => h.replace("Seller reports the IMS bearing was replaced", "Fully documented, no accidents")],
  ["a typed outside the population sentence", h => h.replace(desk.outside[0].sentence, "Automatic cars sell for less.")],
  ["a comparable price the page changed", h => h.replace(M(desk.comparables[0].price), M(desk.comparables[0].price + 500))],
  ["a typed why sentence", h => h.replace(desk.comparables[0].why, "A very close match.")],
  ["a typed listing label", h => h.replace(">Not sold<", ">Ended, reserve not met<")],
  ["a typed difference line", h => h.split(DEMO_CV.assessment.differenceLine).join("The assessment is a little high.")],
  ["a typed position line", h => h.split(DEMO_CV.reserve.positionLine).join("The reserve is conservative.")],
  ["a mileage the page formatted in the header", h => h.replace(/(<p class="chd-spec">)[^<]*/, "$161200 mi")],
  ["a mileage the page formatted in the facts", h => h.replace(">" + DEMO_CV.vehicle.mileageLine + "<", ">61200 miles<")],
  ["a typed source label", h => h.replace(">VIN decoded<", ">Verified by the analyst<")],
];
for (const [n, fn] of MUT) ok(trace(fn(html)).length > 0, "mutant caught: " + n);
done("deskV3WireCheck");
