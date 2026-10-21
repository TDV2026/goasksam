// MARKET CHECK, SAM'S SMALL FIXES (Oct 21 2026; Lane C): (1) the distribution: the dark bar is the engine's typicalBucket and a one-line
// legend 'typical sale' says so (only when the engine marks one); each row prints the share WITH the engine's count '31% (13)' (the count
// alone where the engine sends no share); no empty gap under the subtitle. (2) Live right now: the row reads '$25,250 at 11:21am PT'
// (the day added when not today, the same format as Buy's), under 'Last bid seen', never the word 'current'. No network.
//   node scripts/marketSectionsCheck.mjs   (from the repo root)
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const src = fs.readFileSync(new URL("../public/js/onebox.js", import.meta.url), "utf8"), page = fs.readFileSync(new URL("../public/onebox.html", import.meta.url), "utf8");
const grab = (from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); if (a < 0 || b < 0) throw new Error("missing " + from); return src.slice(a, b); };
// ---- the distribution, rendered with the page's real builder
const env = "var obDistSeq = 0; function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\"/g,'&quot;'); } function usd(n){ return '$' + Math.round(Number(n)).toLocaleString('en-US'); } function lint(s){ return s; } function obNumWordLow(n){ return String(n); } function heroPoolSizeNum(d){ return d.poolN; } function capCardsHtml(){ return ''; } function poolCardHtml(){ return ''; }\n" + grab("  function distBucketLabel(", "  // ORDER AND NOTHING ELSE") + "\nwindow.__dist = distributionHtml;";
const vm = await import("node:vm"); const ctx = vm.createContext({ window: {}, Math, Number, Array, String, Object });
vm.runInContext(env, ctx);
const B = (low, high, count, share, typical) => ({ low, high, count, share, typicalBucket: !!typical, receipts: [] });
const withShare = ctx.window.__dist({ poolN: 42, distribution: { buckets: [B(40000, 50000, 6, 14), B(50000, 60000, 13, 31, true), B(60000, 70000, 12, 29), B(70000, 80000, 7, 17), B(80000, 90000, 4, 9)] } });
const noShare = ctx.window.__dist({ poolN: 12, distribution: { buckets: [B(40000, 50000, 3, null), B(50000, 60000, 5, null, true), B(60000, 70000, 4, null)] } });
const text = h => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
ok(/>31% \(13\)</.test(withShare) && />14% \(6\)</.test(withShare), "the share carries the engine's count: '31% (13)', '14% (6)'");
ok(!/>\d+%</.test(withShare), "no row prints a share without its count");
ok(/<p class="dist-legend"><span class="dist-legend-sw"><\/span>typical sale<\/p>/.test(withShare) && (withShare.match(/dist-bar typical/g) || []).length === 1, "the dark bar (the engine's typicalBucket) has the legend 'typical sale', once");
ok(/>5</.test(noShare) && !/>\d+%/.test(noShare), "where the engine sends no share: the count alone (5, 3, 4), no percentage");
const noTyp = ctx.window.__dist({ poolN: 30, distribution: { buckets: [B(1, 2, 5, 50), B(2, 3, 5, 50)] } });
ok(!/dist-legend/.test(noTyp) && !/dist-bar typical/.test(noTyp), "no typical bucket from the engine: no legend and one colour");
ok(/\.distrows\{display:flex;flex-direction:column;margin-top:0\}/.test(page) && /\.distrows \.distrow:first-child \.distrowbtn\{padding-top:4px\}/.test(page), "no empty gap between the subtitle and the first bar");
// ---- Live right now rows
const live = grab("      var rows = j.rows.map(function (l) {", "      var q = (m && m.displayName)");
ok(!/Current bid/.test(live) && /var amountText = l\.fixedPriceUsd \? "Asking " \+ usd\(l\.fixedPriceUsd\) : \(amt \? amt : "No bids yet"\);/.test(live), "the live row never says 'Current bid': '$X', 'Asking $X' or 'No bids yet'");
ok(/\(!l\.fixedPriceUsd && amt && l\.bid_at\) \? \("at " \+ bidTimePT\(l\.bid_at\)\)/.test(live), "the time is the bid's own, 'at 11:21am PT', through bidTimePT");
const bt = new Function(grab("  function bidTimePT(at) {", "  // LIVE RIGHT NOW") + "\nreturn bidTimePT;")();
const now = new Date(), today = new Date(now.getTime() - 3600e3), old = new Date(now.getTime() - 3 * 86400e3);
ok(/^\d{1,2}:\d\d(am|pm) PT$/.test(bt(today)) || /^\d{1,2}:\d\d(am|pm) PT on \w+day$/.test(bt(today)), "today's bid: 'at 11:21am PT' (" + bt(today) + ")");
ok(/^\d{1,2}:\d\d(am|pm) PT on (Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/.test(bt(old)), "an older bid names the day (" + bt(old) + ")");
const { bidTimePT: buyFmt } = await import("../lib/tasks/bidTime.js");
ok(bt(old) === buyFmt(old, now) && bt(today) === buyFmt(today, now), "the same words as Buy's formatter (lib/tasks/bidTime.js)");
ok(/<th class="colhead">Last bid seen<\/th>/.test(src) && /\.lp-bidtime\{display:inline;margin-left:6px/.test(page), "the column stays 'Last bid seen' (Buy's wording) and the row reads on one line");
console.log(`marketSectionsCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
