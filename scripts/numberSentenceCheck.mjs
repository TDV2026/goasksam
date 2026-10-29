// A PAGE PRINTS THE ENGINE'S SENTENCE, IT NEVER WRITES ONE FROM NUMBERS (Lane B, Oct 29 2026). CAUSE: the page wrote "The year before, the typical range was $X to $Y." from trend.priorYear.low and .high (Sam: "pages and emails compute nothing").
// CLASS: every sentence a Market Check page or card built from engine numbers. Moved to the engine at read time (reason table): trend.priorYearLine (trend.prior_year), ownSales.lastSaleLine (exact.last_sale), cards[].soldBefore.line (card.sold_before),
// distSubLine (dist.sub), factsBlock.line (facts.block), latestQuarterLine (card.latest_quarter), vinMatch.priorSaleLine (vin.prior_sale, lib/_flags.js). The pages print the field.
// LEFT AS LABELS (a value with a one or two word label, not a sentence): "Asking $X", "Lowest sale $X", "Highest sale $X", the chart tooltip rows, the price band label "$A to $B". A new number sentence on the page fails the ratchet below.
//   node scripts/numberSentenceCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const sale = (i, date) => ({ id: "s" + i, _usd: 30000 + i * 900, auction_end_date: date, rtitle: "2001 BMW M3", raw_title: "2001 BMW M3", year: 2001 });
const rows = Array.from({ length: 6 }, (_, i) => sale(i, `2026-0${1 + i}-10`));
const stored = { tier: "result", poolN: 17, rawPool: rows, cluster: [30000, 40000],
  trend: { quarters: [], priorYear: { low: 31000.4, high: 44999.6 } },
  ownSales: { sales: [], lastSale: { price: 52000, date: "2026-03-14", placing: "inside the range" } },
  cards: [{ title: "x", price: 1, soldBefore: { date: "2024-06-02", price: 41000 } }, { title: "y", price: 2, soldBefore: { date: "2023-01-09", price: null } }, { title: "z", price: 3 }],
  factsBlock: { count: 6, window: "since June 2025", lowest: 20000, highest: 31000, latestPrice: 28000, latestMonth: "2026-03" },
  trendQuarters: [{ period: "2026-Q1", low: 30000, high: 36000, count: 9, thin: false }] };
const s = E.withReadFields(stored, "2001 BMW M3", { year: 2001 });
ok("trend.priorYearLine: the year-before sentence, numbers as they were", s.trend.priorYearLine === "The year before, the typical range was $31,000 to $45,000.", s.trend && s.trend.priorYearLine);
ok("ownSales.lastSaleLine", s.ownSales.lastSaleLine === "Its last sale, $52,000 in March, sits inside the range.", s.ownSales.lastSaleLine);
ok("a card's soldBefore.line (with and without a price), and a card with none is untouched", s.cards[0].soldBefore.line === "Sold before on June 2024 for $41,000" && s.cards[1].soldBefore.line === "Sold before on January 2023" && s.cards[2].soldBefore === undefined, JSON.stringify(s.cards.map(c => c.soldBefore && c.soldBefore.line)));
ok("distSubLine", s.distSubLine === "Share of sales in each price band, based on 17 sales.", s.distSubLine);
ok("factsBlock.line", s.factsBlock.line === "Six sales since June 2025, sold between $20,000 and $31,000, most recently $28,000 in March 2026.", s.factsBlock.line);
ok("latestQuarterLine", s.latestQuarterLine === "Latest quarter: 2026 Q1, $30,000 to $36,000 (9 sales)", s.latestQuarterLine);
ok("no prior year, no sentence; a thin last quarter, no sentence", !E.withReadFields({ ...stored, trend: { quarters: [], priorYear: null }, trendQuarters: [{ period: "2026-Q1", low: 1, high: 2, count: 1, thin: true }] }, "x", {}).trend.priorYearLine && !E.withReadFields({ ...stored, trendQuarters: [{ period: "2026-Q1", low: 1, high: 2, count: 1, thin: true }] }, "x", {}).latestQuarterLine);
const flags = fs.readFileSync("lib/_flags.js", "utf8");
ok("the VIN match builds priorSaleLine through the reason table", /priorSaleLine/.test(flags) && /reasonLine\("vin\.prior_sale"/.test(flags));
const R = await import(pathToFileURL(path.join(root, "lib/reasonWords.js")).href);
ok("vin.prior_sale reads as the page's old sentences", R.reasonLine("vin.prior_sale", { text: "Previously sold for $41,000 in June 2024. " }) === "Previously sold for $41,000 in June 2024. ");
// the pages print the field and hold none of the old sentences
const OLD = ["The year before, the typical range", "Its last sale, ", "Sold before on ", "Share of sales in each price band", "Latest quarter: ", "Previously sold for ", "Sold once before", "Sold twice before"];
const hits = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|\.git/.test(e.name)) walk(p); } else if (/\.(js|html)$/.test(e.name) && !/^lib\/(reasonWords|_flags)\.js$/.test(p)) { const t = fs.readFileSync(p, "utf8").replace(/\/\/[^\n]*/g, ""); for (const w of OLD) if (t.includes(w)) hits.push(p + ": " + w); } } };
for (const d of ["api", "lib", "public"]) walk(d);
ok("no page, card, email or api file writes any of those sentences (only the reason table does)", hits.length === 0, hits.join(" | "));
const page = fs.readFileSync("public/js/onebox.js", "utf8");
ok("the page prints the engine fields", ["priorYearLine", "lastSaleLine", "soldBefore.line", "distSubLine", "fb.line", "priorSaleLine"].every(f => page.includes(f)) && fs.readFileSync("lib/sellsForCard.js", "utf8").includes("latestQuarterLine"));
// ratchet: the label sites are the only number-with-words builds on the page
const found = (page.replace(/\/\/[^\n]*/g, "").match(/"[A-Za-z][A-Za-z ,']{5,}" *\+ *(?:usd|money|usdK)\(/g) || []).map(x => x.replace(/ *\+.*/, ""));
const LABELS = ['"Asking "', '"Lowest sale "', '"Highest sale "', '"Typical range "', '"Median "'];
ok("the only words-plus-number builds left on the page are the five value labels", found.every(f => LABELS.includes(f)), found.filter(f => !LABELS.includes(f)).join(" | "));
console.log(fail ? `numberSentenceCheck: ${fail} failure(s)` : "numberSentenceCheck: all pass");
process.exit(fail ? 1 : 0);
