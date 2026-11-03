// NO CARD TEXT IS EVER TRUNCATED (Lane E, Nov 3 2026; Sam). The page applies no ellipsis and no line clamp to a Sam box slot, so the ENGINE writes every slot to fit: a character limit per slot (label, headline, line below), sized for a card
// 390 wide and measured in Chrome (label 48 characters on one line, headline 22, line 2 x 45), kept under with margin (lib/live/cardSlots.js LIMITS). This check
//   1. fails any line that can land in a slot, from ANY source, that is over its limit, listing the line and its length. The sources are every entry of the reason table (thin, fence, question, refusal, not tracked, find, card lines) fed through
//      every channel a card reads a line from (refusal, not tracked, answer line, the fence's thin line), plus the bid lines, with the longest names the table can be given;
//   2. fails a label or headline over its limit for every card state, with the widest figures and the longest band names;
//   3. fails the page CSS if it clamps or ellipsizes a Sam box slot;
//   4. lists every engine line that was over the limit and what the card says instead.
// On main the card printed the raw line: "This listing doesn't say which Boxster it is, and they sell for different money, so there's no single range." (108 characters) in a slot sized for 84.
//   node scripts/slotLimitCheck.mjs
import fs from "node:fs";
process.env.LAUNCH_STAGE = "2";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const CS = await import("../lib/live/cardSlots.js"), { REASON_TABLE } = await import("../lib/reasonWords.js"), cardSlotsOf = CS.cardSlotsOf, LIMITS = CS.LIMITS || { label: 48, headline: 20, line: 84 };   // the limits are the engine's; a tree without them is checked against the same numbers
const WORST = new Proxy({}, { get: (_, k) => ["article"].includes(String(k)) ? "a" : /count|n$|^n|removed|left|pos/i.test(String(k)) ? "12" : "Mercedes-Benz 300 SL Gullwing" });
const BOXSTER = "This listing doesn't say which Boxster it is, and they sell for different money, so there's no single range.";
// 1. every line, every channel
const lines = [BOXSTER]; for (const [id, e] of Object.entries(REASON_TABLE)) { if (!/^(thinLine|answerLine|refusal_line|findAnswer\.lines|bidPlace\.line)$/.test(e.field)) continue; let t; try { t = e.text(WORST); } catch { continue; } if (typeof t === "string" && t.length > 3 && !/^card\./.test(id)) lines.push(t); }
const channels = L => [{ kind: "refused", refusalLine: L, query: null }, { kind: "not_tracked", notTrackedLine: L, query: null }, { kind: "count", count: 0, answerLine: L, query: "x" }, { kind: "count", count: 5, window: "since November 2025", thinReason: "house_share", thinLine: L, query: "x" }];
const over = [], replaced = [];
for (const L of [...new Set(lines)]) for (const m of channels(L)) { const f = cardSlotsOf({ market: m, sam_lines: [] });
  if (L.length > LIMITS.line && f.cardLine !== L) replaced.push([L, f.cardLine]);
  if (f.cardLine.length > LIMITS.line) over.push(`line below ${f.cardLine.length} > ${LIMITS.line}: "${f.cardLine}"`);
  if (f.cardHeadline.length > LIMITS.headline) over.push(`headline ${f.cardHeadline.length} > ${LIMITS.headline}: "${f.cardHeadline}"`);
  if (f.cardLabel.length > LIMITS.label) over.push(`label ${f.cardLabel.length} > ${LIMITS.label}: "${f.cardLabel}"`); }
ok(!over.length, `no engine line lands in a slot over its limit (${[...new Set(over)].slice(0, 6).join(" | ") || lines.length + " lines through 4 channels"})`);
const long = [...new Set(replaced.map(r => r[0]))];
ok(long.some(l => l === BOXSTER) && replaced.filter(r => r[0] === BOXSTER).every(r => r[1].length > 0 && r[1].length <= LIMITS.line), `the Boxster line (${BOXSTER.length} characters) is written short for the card: "${(replaced.find(r => r[0] === BOXSTER) || [])[1]}"`);
for (const l of long) console.log(`  OVER ${l.length} > ${LIMITS.line}: "${l}"  ->  "${(replaced.find(r => r[0] === l) || [])[1]}"`);
// 2. the states, with the widest figures and the longest names
const o = (dimension, label, value, n, low, high) => ({ dimension, label, value, n, low: low ?? null, high: high ?? null, rangeFloor: !low, windowWords: "since September 2026" });
const WIDE = [
  { kind: "range", low: 1200000, high: 1500000, count: 120, window: "since September 2026", query: "x", findAnswer: { state: "range", basis: "pooled", option: null, range: { low: 1200000, high: 1500000 }, n: 120, lines: ["120 sales since September 2026.", "The bid is above every sale with 17 hours left."], pointer: null } },
  { kind: "count", count: 124, window: "since September 2026", optionsState: "apart", headlineDimension: "body", options: [o("body", "Convertible Sedan", "cs", 12, 144000, 152000), o("body", "Speedster", "sp", 3)], query: "x" },
  { kind: "count", count: 124, window: "since September 2026", optionsState: "apart", headlineDimension: "mileage", miles: { miles: 28000 }, options: [o("mileage", "Under 50,000 miles", "lt50", 14), o("mileage", "50,000 to 100,000 miles", "50to100", 129, 126000, 136500), o("mileage", "Over 100,000 miles", "gt100", 111, 116000, 123000)], query: "x" },
  { kind: "count", count: 3, window: "since September 2026", query: "x" }, { kind: "count", count: 12, window: "since September 2026", thinReason: "mixed_prices", thinLine: REASON_TABLE["thin.mixed_prices"].text(), query: "x" }];
for (const m of WIDE) { const f = cardSlotsOf({ market: m, sam_lines: [], miles: 28000 }); ok(f.cardLabel.length <= LIMITS.label && f.cardHeadline.length <= LIMITS.headline && f.cardLine.length <= LIMITS.line, `widest state fits: "${f.cardLabel}" (${f.cardLabel.length}) | "${f.cardHeadline}" (${f.cardHeadline.length}) | "${f.cardLine}" (${f.cardLine.length})`); }
// 3. the page CSS
const src = fs.readFileSync("api/buy.js", "utf8"), rules = [...src.matchAll(/([^{}"\\]*(?:\.cs-(?:label|head|line)|\.fx-(?:ans|count|bid|range|answer|near|wide|spec|scope))[^{}"\\]*)\{([^}]*)\}/g)];
const bad = rules.filter(r => /text-overflow|line-clamp|-webkit-box-orient/.test(r[2])).map(r => r[1].trim().slice(0, 60));
ok(rules.length >= 6 && !bad.length, `no Sam box slot rule clamps or ellipsizes its text (${rules.length} slot rules read${bad.length ? "; clamped: " + bad.join(", ") : ""})`);
console.log(`slotLimitCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
