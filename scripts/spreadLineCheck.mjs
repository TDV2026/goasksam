// SAM'S RANGE FOOTER AND FIND BID LINE (Lane B, Oct 29 2026). This check began as the "vary widely" spread line (f9a1c312); Sam replaced it the same day:
//   MARKET CHECK footer: ONE field, two sentences, every answer that shows one range: "Half of the 11 sales since November 2023 landed in this range. The rest ran from $139,000 to $355,500." (rangeSentence, the pool's real lowest and
//   highest sale); "Updated Oct 28, 2026." is its own field (updatedLine). No spread trigger and no spreadLine field.
//   FIND card: no spread line. The Sam block has the range (or the honest reason), the count line, and the bid line: "The bid is below the range with 17 hours left." (also within, above), "No bids yet." with no bid, "Sold below the range."
//   for an ended auction that sold. A comparison with no time left on a live car is never printed.
// This check: (1) spreadLine is gone everywhere (field, table, registry, page); (2) the footer fields and what the card prints; (3) every bid line, over a grid of positions, times and car states, carries the time left on a live car;
// (4) the Find lines never carry the car's name; (5) no file builds a bid sentence of its own.
//   node scripts/spreadLineCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
globalThis.fetch = async (url) => String(url).includes("app_usage_events") ? new Response(JSON.stringify([{ created_at: "2026-10-28T20:00:00Z" }]), { status: 200 }) : new Response("[]", { status: 200 });
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), C = await import(pathToFileURL(path.join(root, "lib/sellsForCard.js")).href), A = await import(pathToFileURL(path.join(root, "lib/asOf.js")).href);
const RW = await import(pathToFileURL(path.join(root, "lib/reasonWords.js")).href), F = await import(pathToFileURL(path.join(root, "lib/engineFields.js")).href);
await A.lastUpdatedDate({ supabaseUrl: "http://fake", supabaseKey: "k" });
const gt3 = [355500, 230000, 217500, 209000, 199000, 190000, 180000, 172000, 170000, 150497, 139000], rows = gt3.map((x, i) => ({ id: "g" + i, _usd: x }));
const one = { tier: "result", poolN: 11, soldCount: 11, cluster: [172000, 209000], optionsState: null, rawPool: rows, windowWords: "since November 2023", windowLine: "11 sales, since November 2023.", lowestSaleN: 139000, highestSaleN: 355500, span: [139000, 356000] };
const serve = (x, y = 2010) => E.withReadFields(x, "2010 Porsche 911 GT3", { year: y });
// 1. spreadLine is gone
{ const d = serve(one);
  ok("no spreadLine field is served, none is registered, no reason-table line says it, no function builds it", !("spreadLine" in d) && !F.ENGINE_FIELDS_LIST?.includes?.("spreadLine") && !Object.values(RW.REASON_TABLE).some(r => r.field === "spreadLine") && typeof E.spreadLineOf === "undefined" && !fs.readFileSync("lib/engineFields.js", "utf8").split("\n").some(l => /^\s*"spreadLine"/.test(l)));
  ok("a stored row that still carries spreadLine has it removed at read time", !("spreadLine" in E.freshenStoredText({ ...one, spreadLine: "These sales vary widely, from $139,000 to $355,500." })) ); }
// 2. the footer
{ const d = serve(one), html = C.sellsForCardHtml(d, { updated: "Oct 28, 2026" }), text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  ok("rangeSentence is Sam's two sentences with the pool's real lowest and highest", d.rangeSentence === "Half of the 11 sales since November 2023 landed in this range. The rest ran from $139,000 to $355,500.", d.rangeSentence);
  ok("updatedLine is its own field", d.updatedLine === "Updated Oct 28, 2026.", d.updatedLine);
  ok("the card footer prints the range sentence then the updated line in its own span, and states the count once (no \"11 sales, since\")", text.includes(d.rangeSentence + " Updated Oct 28, 2026.") && /<span class="sfc-updated">Updated Oct 28, 2026\.<\/span>/.test(html) && !/11 sales, since/.test(text), text.slice(-170));
  const prices = [5, 6, 7, 8, 9, 10, 11, 12].map(i => 50000 + i * 700 + 11);
  const tight = serve({ ...one, poolN: 8, soldCount: 8, rawPool: prices.map((x, i) => ({ id: "t" + i, _usd: x })), cluster: [53000, 57000], lowestSaleN: null, highestSaleN: null });
  ok("no trigger: a pool with a 1.2 spread prints it too, with the unrounded real low and high", tight.rangeSentence === `Half of the 8 sales since November 2023 landed in this range. The rest ran from $${Math.min(...prices).toLocaleString("en-US")} to $${Math.max(...prices).toLocaleString("en-US")}.`, tight.rangeSentence);
  ok("a thin answer, a refusal and an option block carry no range sentence and a refusal no updated line", serve({ ...one, tier: "thin" }).rangeSentence == null && serve({ ...one, optionsState: "split" }).rangeSentence == null && serve({ tier: "refusal", refusal: { kind: "invariant_failed" } }).updatedLine == null); }
// 3. the Find bid line
const NOW = Date.parse("2026-10-14T12:00:00Z"), at = ms => new Date(NOW + ms).toISOString(), H = 36e5;
const range = { tier: "result", poolN: 12, cluster: [31000, 41000], windowWords: "since November 2025", optionsState: "none", rawPool: Array.from({ length: 12 }, (_, i) => ({ _usd: 31000 + i * 900, mileage: 40000 + i * 1000, auction_end_date: "2026-0" + (1 + (i % 9)) + "-10" })) };
const line = ctx => { const fa = E.findAnswerOf(range, { title: "2014 Porsche Boxster S", year: 2014, now: NOW, ...ctx }); return fa ? fa.lines.slice(1) : null; };
ok("a live car, bid below, 17 hours left", JSON.stringify(line({ bid: 29000, live: true, endTime: at(17 * H + 6e5) })) === JSON.stringify(["The bid is below the range with 17 hours left."]));
ok("within and above say the same with the time left", JSON.stringify(line({ bid: 35000, live: true, endTime: at(17 * H + 6e5) })) === JSON.stringify(["The bid is within the range with 17 hours left."]) && JSON.stringify(line({ bid: 45000, live: true, endTime: at(3 * 864e5 + H) })) === JSON.stringify(["The bid is above the range with 3 days left."]));
ok("time words: minutes, one hour, hours, days", [[30 * 6e4 + 5e3, "30 minutes"], [H + 6e4, "1 hour"], [47 * H + 6e4, "47 hours"], [5 * 864e5 + H, "5 days"], [30e3, "1 minute"]].every(([ms, w]) => (line({ bid: 29000, live: true, endTime: at(ms) })[0] || "").endsWith(`with ${w} left.`)));
ok("a live car with no bid: \"No bids yet.\"", JSON.stringify(line({ live: true, noBid: true, endTime: at(5 * H) })) === JSON.stringify(["No bids yet."]));
ok("an ended auction that sold: \"Sold below the range.\" (within, above)", JSON.stringify(line({ soldPrice: 29000 })) === JSON.stringify(["Sold below the range."]) && JSON.stringify(line({ soldPrice: 35000 })) === JSON.stringify(["Sold within the range."]) && JSON.stringify(line({ soldPrice: 45000 })) === JSON.stringify(["Sold above the range."]));
ok("an ended auction that did not sell, and a car with unknown state, print no bid line", JSON.stringify(line({ bid: 29000, live: false })) === "[]" && JSON.stringify(line({ bid: 29000 })) === "[]");
// the class: every combination of position, time state and car state; a line that compares a bid always carries the time left on a live car
{ const bad = []; let n = 0;
  for (const bid of [0, 20000, 31000, 36000, 41000, 50000]) for (const endTime of [null, "", "not a date", at(-H), at(0), at(17 * H), at(9 * 864e5)]) for (const live of [true, false, undefined]) for (const noBid of [true, false]) for (const soldPrice of [null, 29000]) {
    const l = line({ bid, live, endTime, noBid, soldPrice }) || []; n++;
    for (const t of l) { if (/The bid is/.test(t) && !(live === true && / with \d+ (minutes?|hours?|days) left\.$/.test(t))) bad.push(JSON.stringify({ bid, endTime, live, t })); if (/The bid is/.test(t) && live === true && !(Date.parse(endTime) > NOW)) bad.push("no time left: " + t); if (/^Sold /.test(t) && !(soldPrice > 0)) bad.push(t); if (/^No bids yet/.test(t) && !(live === true && noBid && !(bid > 0))) bad.push(t); }
  }
  ok(`over ${n} combinations no bid comparison prints without the time left on a live car, and no sold or no-bid line prints in the wrong state`, bad.length === 0, bad.slice(0, 3).join(" | ")); }
// the buy path that builds the lines for the cards
{ const S = await import(pathToFileURL(path.join(root, "api/buySearch.js")).href);
  const base = { market: { kind: "range", low: 62000, high: 84000, rungLines: [], soldLine: "The middle half of sales landed at $62,000 to $84,000." }, current_bid_usd: 36000, end_time: at(17 * H + 6e5), timeline: [] };
  ok("samLines: the card's bid line carries the time left", S.samLines(base, NOW)[0].bidLine === "The bid is below the range with 17 hours left." && /with 17 hours left\.$/.test(S.samLines(base, NOW)[0].text));
  ok("samLines: a live car with no end time gets no bid comparison", !/The bid is/.test(S.samLines({ ...base, end_time: null }, NOW)[0].text) && !S.samLines({ ...base, end_time: null }, NOW)[0].bidLine);
  const cnt = { market: { kind: "count", saleSpan: [20000, 30000], soldLine: "Six sales since June 2025, too few for a range." }, current_bid_usd: 15000, end_time: at(2 * H + 6e5), timeline: [] };
  ok("the bid against the sales (no range) carries the time left too", /^The bid is below every sale with 2 hours left\.$/.test(S.bidAgainstSales(cnt, NOW) || ""), S.bidAgainstSales(cnt, NOW)); }
// 4. the Find lines carry no car name
{ const fa = E.findAnswerOf(range, { title: "2014 Porsche Boxster S", year: 2014, now: NOW, bid: 29000, live: true, endTime: at(17 * H + 6e5) }), all = fa.lines.join(" ");
  ok("the Find lines hold the count and the bid, never the car's name", !/Porsche|Boxster|2014/i.test(all) && fa.lines.length === 2, all); }
// 5. no file builds a bid comparison sentence of its own
{ const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (/node_modules|\.git/.test(e.name) ? [] : walk(path.join(d, e.name))) : /\.(js|mjs|html)$/.test(e.name) ? [path.join(d, e.name)] : []);
  const hits = [];
  for (const f of [...walk("lib"), ...walk("api"), ...walk("public")]) { if (f === "lib/reasonWords.js") continue; const t = fs.readFileSync(f, "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, ""); for (const l of t.split("\n")) if (/The bid is (\$\{|below|within|above)/.test(l)) hits.push(f + ": " + l.trim().slice(0, 100)); }
  ok("no lib, api or public file writes \"The bid is below/within/above...\" itself (the sentences come from the reason table)", hits.length === 0, hits.join(" | ")); }
console.log(fail ? `spreadLineCheck: ${fail} failure(s)` : "spreadLineCheck: all pass");
process.exit(fail ? 1 : 0);
