// A TASK EMAIL PRINTS BY THE ENGINE'S emailMode AND NEVER ASKS A QUESTION (Sam, Oct 27 2026; lib/onebox.js emailModeOf). The answer says what an email may print: range (the pooled range),
// range_with_options (the pooled range and each option's own line), options (each option's own range, no pooled range), sales (the sales only), none (nothing). The email prints by that,
// whatever the engine also asked (escalatedFrom, a question), and never prints a question: nobody is there to answer it. The market object is the real Find path (coreOf, marketFromCore), the lines are the
// email's own (lib/tasks/tasks.js blockLines for the block, lib/tasks/emailCards.js for the card), and the mode is the engine's own emailModeOf. The real answers are in scripts/fixtures. No network.
//   node scripts/emailModeCheck.mjs
import fs from "node:fs";
process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
globalThis.fetch = async () => { throw new Error("no network in this check"); };
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const rd = f => JSON.parse(fs.readFileSync("scripts/fixtures/" + f, "utf8"));
const S = await import("../lib/live/search.js"), { samLines } = await import("../api/buySearch.js"), { emailCardData } = await import("../lib/tasks/emailCards.js"), { blockLines } = await import("../lib/tasks/tasks.js"), { emailModeOf } = await import("../lib/onebox.js");
const m3 = rd("m3Answer.json"), diablo = rd("answer-diablo.json");
// e96: the engine writes the lines (optionLines under a range; headlineLines in place of one); the email prints them as written
const OPT = (dimension, label, value, n, low, high, median) => ({ dimension, label, value, n, low, high, ...(median ? { median } : {}) });
const LN = o => `${o.label} $${o.low.toLocaleString("en-US")} to $${o.high.toLocaleString("en-US")}, ${o.n} sales`;
const e96 = (d, state, opts) => ({ ...d, optionsState: state, options: opts, optionLines: opts.map(LN), headlineLines: state === "alike" ? [] : opts.map(LN) });
const withMode = d => ({ ...d, emailMode: emailModeOf(d) });
const CASES = {
  range: withMode(m3),
  range_with_options: withMode(e96(m3, "alike", [OPT("body", "Convertible", "convertible", 9, 29000, 42500, 35500), OPT("body", "Coupe", "coupe", 8, 22500, 31500, 27000)])),
  options: withMode(e96({ ...m3, cluster: null, referenceFigure: null, noCluster: true, trend: null }, "apart", [OPT("body", "Convertible", "convertible", 9, 36000, 48000), OPT("body", "Coupe", "coupe", 8, 21000, 29000)])),
  sales: withMode(diablo),
  none: withMode({ status: "one_box", tier: "refusal", cluster: null, poolN: 0, cards: [], samLine: "Sales too spread out for a range.", refusal_line: "Sam could not verify this one, so no figures are shown." }),
};
const POOLED = "$22,500 to $41,000", SALE = "$1,063,000";
const QUESTION = /\?|\bwhich\b|\bpick an option\b|\bchoose\b|\bselect\b/i;
const ROW = { listing_title: "2001 BMW M3 Coupe", year: 2001, make: "BMW", model: "M3" };
function emailOf(d, extra) {
  if (d.emailMode === "none") { const m = { kind: "refused", emailMode: "none", refusalLine: d.refusal_line }; const l = { id: 1, title: ROW.listing_title, make: "BMW", year: 2001, market: m }; l.sam_lines = samLines(l, Date.now()); return { card: emailCardData(l).sam.map(x => x.text).join(" | "), block: blockLines(m, 30000, "", "Current bid $30,000.", "Current bid", null).lines.join(" | "), rangeLine: "", m }; }
  const spec = S.specOf(ROW), core = S.coreOf({ ...d, ...(extra || {}) }, spec), m = S.marketFromCore(core, ROW, { miles: null }, spec);
  const l = { id: 1, title: ROW.listing_title, make: "BMW", year: 2001, market: m }; l.sam_lines = samLines(l, Date.now());
  const card = emailCardData(l).sam.map(x => x.text).join(" | ");
  const block = blockLines(m, 30000, "", "Current bid $30,000.", "Current bid", null);
  return { card, block: block.lines.join(" | "), rangeLine: block.rangeLine || "", m };
}
for (const [mode, d] of Object.entries(CASES)) {
  ok(d.emailMode === mode, `the engine's own emailModeOf reads ${mode} for its fixture (got ${d.emailMode})`);
  const e = emailOf(d), all = e.card + " | " + e.block, where = `emailMode ${mode}`;
  ok(!QUESTION.test(all.replace(/does not say which it is/g, "")), `${where}: the email prints no question (${all.match(QUESTION) || ""})`);   // e101: "... this listing does not say which it is" is a statement
  if (mode === "range") ok(e.card.includes(POOLED) && /\$22,500 to \$41,000|inside/.test(e.block + e.card), `${where}: the pooled range is printed`);
  if (mode === "range_with_options") {
    ok(e.card.includes(POOLED) && /Convertible \$29,000 to \$42,500, 9 sales/.test(e.card) && /Coupe \$22,500/.test(e.card), `${where}: the card prints the pooled range and each option's own line`);
    ok(/Convertible \$29,000 to \$42,500, 9 sales/.test(e.block) && /Coupe \$22,500 to \$31,500/.test(e.block), `${where}: the block prints each option's own line (${e.block})`);
  }
  if (mode === "options") {
    ok(!e.card.includes(POOLED) && !e.block.includes(POOLED) && !/\$22,500 to \$41,000/.test(all), `${where}: no pooled range anywhere in the email`);
    ok(/Convertible \$36,000 to \$48,000, 9 sales/.test(e.card) && /Coupe \$21,000 to \$29,000/.test(e.card), `${where}: the card prints each option's own range`);
    ok(/Convertible \$36,000 to \$48,000, 9 sales/.test(e.block) && /Coupe \$21,000 to \$29,000/.test(e.block), `${where}: the block prints each option's own range (${e.block})`);
  }
  if (mode === "sales") {
    ok(e.card.includes(SALE) && !/ to \$\d/.test(e.card), `${where}: the card prints the sales and no range`);
    ok(!/ to \$\d/.test(e.block) && /sale|Not enough/i.test(e.block), `${where}: the block prints the sales line and no range (${e.block})`);
  }
  if (mode === "none") ok(e.card === "" && e.block === "Current bid $30,000.", `${where}: nothing about the market prints (card "${e.card}", block "${e.block}")`);
}
// whatever else the engine asked, the email follows emailMode: an answer that also carries a question (escalatedFrom) still prints its mode
{
  const asked = { escalatedFrom: { tier: "body_choice", prompt: "Which body style is it?", options: ["Convertible", "Coupe"] } };
  const e = emailOf(CASES.range, asked);
  ok(e.card.includes(POOLED) && !QUESTION.test(e.card + e.block), "a question the engine asked first does not change what the email prints: the range (mode range)");
  ok(/inside|\$22,500 to \$41,000/.test(e.block) && !/Which body/.test(e.block), `the block still prints the range by its mode (${e.block})`);
  const o = emailOf(CASES.options, asked);
  ok(!o.card.includes(POOLED) && !/Which body/.test(o.card + o.block) && /Coupe \$21,000/.test(o.block), "an options answer that also asked a question prints its option lines and no question");
}
// the Find path marks every no-market read none, so an email prints nothing for it
{ const src = fs.readFileSync("lib/live/search.js", "utf8"); for (const k of ['kind: "unmatched", emailMode: "none"', 'kind: "not_tracked", emailMode: "none"', 'kind: "refused", emailMode: "none"']) ok(src.includes(k), `listingMarket marks ${k.split(",")[0]} as emailMode none`); }
// the code itself: the block decides by emailMode, and no email path prints the engine's question
{ const src = fs.readFileSync("lib/tasks/tasks.js", "utf8"), i = src.indexOf("export function blockLines"), blk = src.slice(i, src.indexOf("export function bidBlock", i));
  ok(/emailMode/.test(blk), "blockLines reads emailMode");
  ok(!/applyRung\(m0 && m0\.kind !== "pending" && !engineAsks\(m0\)/.test(blk), "blockLines no longer lets a question decide what the email prints");
  const card = fs.readFileSync("lib/tasks/emailCards.js", "utf8"); ok(/emailMode === "none"/.test(card), "the email card prints nothing for emailMode none");
  for (const f of ["lib/tasks/emailCards.js", "lib/tasks/digest.js", "lib/tasks/emailCardLayout.js"]) ok(!/engineAsks|setupQuestion|\.prompt\b/.test(fs.readFileSync(f, "utf8")), `${f}: no question reaches an email`); }
console.log(`emailModeCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
