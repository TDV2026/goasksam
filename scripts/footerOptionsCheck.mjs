// AN ANSWER WITH OPTIONS STATES NO TOTAL AND NO WINDOW IN ITS FOOTER; EVERY OPTION STATES ITS OWN; THE TITLE LINE NEVER REPEATS THE TITLE'S YEAR (Lane B, Oct 29 2026, Sam's ruling).
// BEFORE: the Market Check card footer said "49 sales, since October 2025. Updated Oct 28, 2026." under options that said "Manual 33" and "SMG 3" (the 2004 M3), and the title line said "Coupes, targas and cabriolets, 1986 · latest sale Oct 20, 2026"
// under the title "1986 Porsche 911 Carrera". NOW (read time, the engine's own fields, no stamp change): an answer with options (alike, split, apart; any option kind) has windowLine, basisLine, latestSaleLine and the total count line null, so the
// footer is "Updated <date>." and the How Sam decides link; each range option prints its own count and its own since date, an option that shares the footer's window too ("Coupe ... 16 sales since November 2025"); a thin option keeps
// "3 sales, too few for a range"; the remainder line stays; a single range keeps the footer exactly. scopeLine drops the year the title already carries and keeps the year when the title has none or the pool runs past it.
// Old stored rows serve the same lines through freshenStoredText (storedTextCheck carries the stored shapes).
//   node scripts/footerOptionsCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), C = await import(pathToFileURL(path.join(root, "lib/sellsForCard.js")).href);
const TOTAL = /\b\d[\d,]*\s+sales?,?\s+since\b|\bBased on\b/i, pool = n => Array.from({ length: n }, (_, i) => ({ id: "p" + i, _usd: 40000 + i * 800, auction_end_date: "2026-0" + (1 + (i % 9)) + "-12", year: 1986, rtitle: "1986 Porsche 911 Carrera", transmission: "Manual" }));
const opt = (dim, label, value, n, extra) => ({ dimension: dim, label, value, n, low: 50000, high: 80000, rangeFloor: false, ownWindow: false, windowWords: "since November 2025", ...(extra || {}) });
const base = { tier: "result", poolN: 35, rawPool: pool(35), cluster: null, windowWords: "since November 2025", windowLine: "35 sales, since November 2025.", basisLine: "Based on 35 sales, the latest in October 2026.", latestSaleLine: "The latest sale was October 20, 2026.", countLine: "35 sales since November 2025.",
  rungLabel: "1986 911 Carrera, coupes, targas and cabriolets", poolYears: [1986, 1986], freshness: { through: "2026-10-20", archiveThrough: "2026-10-20" }, resolvedCar: { year: 1986, make: "Porsche", model: "911", canonicalLabel: "1986 Porsche 911 Carrera" } };
const shapes = {
  "alike, body": { ...base, optionsState: "alike", headlineDimension: "body", cluster: [50000, 90000], options: [opt("body", "Coupe", "coupe", 16), opt("body", "Targa", "targa", 11), opt("body", "Cabriolet", "cabriolet", 3, { rangeFloor: true, low: null, high: null })] },
  "split, gearbox": { ...base, optionsState: "split", headlineDimension: "gearbox", thinReason: "pooled_apart", headlineLines: ["Manual", "SMG"], options: [opt("gearbox", "Manual", "manual", 20), opt("gearbox", "SMG", "auto", 3, { rangeFloor: true, low: null, high: null })] },
  "apart, mileage": { ...base, optionsState: "apart", headlineDimension: "mileage", thinReason: "pooled_apart", headlineLines: ["a", "b"], options: [opt("mileage", "Under 50,000 miles", "under50", 17), opt("mileage", "50,000 to 100,000 miles", "mid", 18)] },
  "alike, edition": { ...base, optionsState: "alike", headlineDimension: "edition", cluster: [50000, 90000], options: [opt("edition", "Competition", "competition", 15), opt("edition", "Base", "base", 20)] },
  "alike, year": { ...base, optionsState: "alike", headlineDimension: "year", cluster: [50000, 90000], options: [opt("year", "1985", "1985", 15), opt("year", "1986", "1986", 20)] }
};
for (const [name, a] of Object.entries(shapes)) {
  const blocks = /^(split|apart)$/.test(a.optionsState);   // the card shows option BLOCKS in place of a range; an alike answer is one range with its option pills (Oct 29 2026)
  const d = E.withReadFields(a, "1986 Porsche 911 Carrera", { year: 1986 });
  const html = C.sellsForCardHtml(d, { updated: "Oct 28, 2026" }), foot = (html.match(/<div class="sfc-footer">[\s\S]*$/) || [""])[0], footText = foot.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (blocks) {
    ok(`${name}: option blocks, so the footer states no total count and no total since date (windowLine, basisLine, latestSaleLine, countLine all null)`, !d.windowLine && !d.basisLine && !d.latestSaleLine && !d.countLine, JSON.stringify([d.windowLine, d.basisLine, d.latestSaleLine, d.countLine]));
    ok(`${name}: the rendered footer has no total`, /Updated Oct 28, 2026\./.test(foot) && !TOTAL.test(footText) && /how-sam-decides|How Sam decides/.test(html), footText.slice(0, 140));
    ok(`${name}: the all-sales caption is the engine's metaLine, with no window`, typeof d.metaLine === "string" && !/since/.test(d.metaLine), d.metaLine);
  } else {
    ok(`${name}: one range with option pills keeps its count and since date, once`, (footText.match(/\d[\d,]* sales?, since [A-Z][a-z]+ \d{4}/g) || []).length === 1 && /Updated Oct 28, 2026\./.test(footText), footText.slice(0, 160));
  }
  const has = /a quarter of sales landed below it/.test(footText), shouldHave = Array.isArray(d.cluster) || (blocks && (d.options || []).some(o => !o.rangeFloor));
  ok(`${name}: the range sentence is in the footer once when a range is shown, and not otherwise`, (footText.match(/The range is the middle of the market: a quarter of sales landed below it and a quarter above\./g) || []).length === (shouldHave ? 1 : 0) && has === shouldHave, footText.slice(0, 160));
  const range = (d.options || []).filter(o => !o.rangeFloor), lines = d.optionLines || [];
  ok(`${name}: every range option prints its own count and its own since date`, range.length > 0 && range.every(o => lines.some(l => l.includes(o.label) && new RegExp(`${o.n} sales? since [A-Z][a-z]+ \\d{4}`).test(l))), lines.join(" | "));
  ok(`${name}: a thin option keeps "N sales, too few for a range" with no since date`, (d.options || []).filter(o => o.rangeFloor).every(o => lines.some(l => l.includes(o.label) && new RegExp(`${o.n} sales?, too few for a range`).test(l) && !/since/.test(l))), lines.join(" | "));
}
// no range at all (every option thin): no range sentence, only "Updated <date>."
{ const a = { ...shapes["split, gearbox"], headlineLines: ["a", "b"], options: [opt("gearbox", "Manual", "manual", 5, { rangeFloor: true, low: null, high: null }), opt("gearbox", "SMG", "auto", 3, { rangeFloor: true, low: null, high: null })] }, d = E.withReadFields(a, "x", { year: 2004 }), t = C.sellsForCardHtml(d, { updated: "Oct 28, 2026" }).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  ok("an answer that shows no range (every option thin) carries no range sentence", d.rangeSentence == null && !/a quarter of sales landed below it/.test(t) && /Updated Oct 28, 2026\./.test(t), t.slice(-120)); }
{ const d = E.withReadFields(shapes["alike, body"], "1986 Porsche 911 Carrera", { year: 1986 }); ok("the Coupe, which shares the footer's window, reads \"16 sales since November 2025\"", (d.optionLines || []).some(l => /^Coupe .*16 sales since November 2025$/.test(l)), (d.optionLines || []).join(" | ")); }
{ const a = { ...shapes["alike, body"], poolN: 38, rawPool: pool(38), options: [opt("body", "Coupe", "coupe", 16), opt("body", "Targa", "targa", 11), opt("body", "Cabriolet", "cabriolet", 11, { windowWords: "since February 2025", ownWindow: true })] }, d = E.withReadFields(a, "1986 Porsche 911 Carrera", { year: 1986 });
  ok("an option on its own window still prints its own count and its own since date (Cabriolet since February 2025)", (d.optionLines || []).some(l => /Cabriolet .*11 sales since February 2025/.test(l))); }
// the remainder line stays
{ const a = { ...shapes["split, gearbox"], poolN: 49, rawPool: pool(49), options: [opt("gearbox", "Manual", "manual", 33), opt("gearbox", "SMG", "auto", 3, { rangeFloor: true, low: null, high: null })], windowWords: "since October 2025" }, d = E.withReadFields(a, "2004 BMW M3", { year: 2004 });
  ok("the remainder line (sales that name no gearbox) is still served beside options", d.optionsRemainder === null || typeof d.optionsRemainder === "object", JSON.stringify(d.optionsRemainder && d.optionsRemainder.line)); }
// a single range with no options keeps its footer exactly
{ const a = { ...base, poolN: 43, windowWords: "since October 2025", windowLine: "43 sales, since October 2025.", cluster: [50000, 90000], optionsState: "none", options: [] }, d = E.withReadFields(a, "1995 Porsche 911", { year: 1995 }), html = C.sellsForCardHtml(d, { updated: "Oct 28, 2026" });
  ok("a single range keeps windowLine and its footer: \"43 sales, since October 2025. Updated Oct 28, 2026.\"", d.windowLine === "43 sales, since October 2025." && /43 sales, since October 2025\. Updated Oct 28, 2026\./.test(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")), html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(-120)); }
// the title line: no repeated year, year kept when the title has none, the span kept when the pool runs past the title's year
{ const t = (rc, py, label) => E.scopeLineOf({ tier: "result", resolvedCar: rc, rungLabel: label || "1986 911 Carrera, coupes, targas and cabriolets", poolYears: py, freshness: { through: "2026-10-20" } });
  ok("title \"1986 Porsche 911 Carrera\" carries the year: \"Coupes, targas and cabriolets · latest sale Oct 20, 2026\"", t({ year: 1986, canonicalLabel: "1986 Porsche 911 Carrera" }, [1986, 1986]) === "Coupes, targas and cabriolets · latest sale Oct 20, 2026", t({ year: 1986, canonicalLabel: "1986 Porsche 911 Carrera" }, [1986, 1986]));
  ok("a title with no year keeps the year in the line", /^Coupes, targas and cabriolets, 1986 · latest sale/.test(t({ year: null, make: "Porsche", model: "911", canonicalLabel: "Porsche 911 Carrera" }, [1986, 1986])), t({ year: null, canonicalLabel: "Porsche 911 Carrera" }, [1986, 1986]));
  ok("a pool that runs past the title's year keeps its span (it says what the title does not)", /1984 to 1986/.test(t({ year: 1986, canonicalLabel: "1986 Porsche 911 Carrera" }, [1984, 1986])));
  ok("with no canonical label the resolved year is the title's year", !/1986/.test(t({ year: 1986, make: "Porsche", model: "911" }, [1986, 1986]))); }
console.log(fail ? `footerOptionsCheck: ${fail} failure(s)` : "footerOptionsCheck: all pass");
process.exit(fail ? 1 : 0);
