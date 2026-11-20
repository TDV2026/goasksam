// THE VEHICLE COUNT (Lane S, Nov 19 2026; crew only, FORSALE_PUBLIC off). The engine returns how many vehicles are for sale right now across the auctions, the dealers and the classifieds, rounded DOWN to the thousand,
// as forSale.counts.total, with its two lines (forSale.lines.searching "Searching 51,000+ vehicles for sale right now", forSale.lines.top "51,000+ vehicles for sale right now, at auction, dealers and classifieds.").
// The page prints the engine's lines: the searching sign while a search runs, the top of Find above the landing. Never an exact number, never a number for one source, never a count of sources.
// Rule: pages and emails compute nothing, everything comes from oneEngineAnswer. The check runs the REAL engine (api/buySearch.js, lib/forsale/total.js over Lane D's own for sale world, scripts/_forSaleWorld.mjs) with 1,992
// extra live auctions so the world holds more than a thousand, and the REAL page (api/buy.js) for a crew request and a visitor.
// CLASS: any page line that carries a number about the inventory. The number is the engine's field, rounded in the engine, and the sentence is the engine's; a page that sums, rounds or words it fails here.
// A tree without the fix fails (run against origin/main); --mutants breaks one rule at a time.
//   node scripts/vehicleCountCheck.mjs [repo root]
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
const say = x => fs.writeSync(1, x + "\n");   // the world replaces console.log with its own log
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; say("FAIL " + n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 300) : "")); } };
const W = await import(pathToFileURL(path.join(root, "scripts/_forSaleWorld.mjs")).href);
// the world's fake database answers a whole table to every read; a read of more than a thousand rows pages by Range (lib/_supabase.js), so the fake answers the page asked for, as PostgREST does
{ const real = globalThis.fetch; globalThis.fetch = async (u, init) => { const r = await real(u, init); const h = init && init.headers, rg = h && (h.Range || h.range);
  if (!rg || !/\/live_listings/.test(String(u))) return r; const m = /^(\d+)-(\d+)$/.exec(rg); if (!m) return r; const all = await r.json(), a = Number(m[1]), b = Number(m[2]);
  return new Response(JSON.stringify(all.slice(a, b + 1)), { status: 200, headers: { "content-type": "application/json", "content-range": `${a}-${Math.min(b, all.length - 1)}/${all.length}` } }); }; }
const BUYPAGE = (await import(pathToFileURL(path.join(root, "api/buy.js")).href)).default;
const RW = await import(pathToFileURL(path.join(root, "lib/reasonWords.js")).href), reasonLine = (id, p) => { try { return RW.reasonLine(id, p); } catch { return null; } };   // a tree without the lines fails by assertion, not by a crash
let T = null; try { T = await import(pathToFileURL(path.join(root, "lib/forsale/total.js")).href); } catch (e) { ok("lib/forsale/total.js loads", false, String(e && e.message).slice(0, 160)); }
const reset = () => { W.SERVE.forSaleReset(); if (T && T.forSaleTotalReset) T.forSaleTotalReset(); };
const WORDS = /^\d{1,3}(,\d{3})*\+$/;
// 1 under a thousand there is no count: a small number is not "1,000+"
reset(); const small = W.json(await W.find({ q: "1987 Porsche 911" })), fs0 = small && small.forSale;
ok("under a thousand vehicles the engine serves no total and no lines", !!fs0 && fs0.counts && fs0.counts.total === undefined && fs0.lines === undefined, fs0 && { c: fs0.counts, l: fs0.lines });
// 2 more than a thousand: the engine's number, rounded down to the thousand
// 1,995 live auctions: the auctions alone round to 1,000, the auctions with the dealers and classifieds round to 2,000, so a total that leaves a kind out is not the same number
for (let i = 0; i < 1992; i++) W.liveRow(1950 + (i % 60), "Ford", "Mustang", 20000 + i);
reset(); const big = W.json(await W.find({ q: "1987 Porsche 911" })), FS = big && big.forSale, c = FS && FS.counts || {};
const held = W.LIVE.length + W.TABLE.filter(r => !r.gone && r.resolve_state === "resolved").length;   // what the world holds at most, for the bound only (the check never prints it)
ok("the engine serves forSale.counts.total", Number.isInteger(c.total) && c.total >= 1000, c);
ok("the total is rounded DOWN to the thousand: a multiple of 1,000 that the world holds at least, and not the exact count", c.total % 1000 === 0 && c.total >= 2000 && c.total <= held && held % 1000 !== 0, { total: c.total, held });
const L = FS && FS.lines || {}, words = c.total ? c.total.toLocaleString("en-US") + "+" : "?";
ok("the engine's searching line is its own words: \"Searching N,000+ vehicles for sale right now\"", L.searching === reasonLine("forsale.total_searching", { total: words }) && L.searching === `Searching ${words} vehicles for sale right now`, L);
ok("the engine's top line is its own words: \"N,000+ vehicles for sale right now, at auction, dealers and classifieds.\"", L.top === reasonLine("forsale.total_top", { total: words }) && L.top === `${words} vehicles for sale right now, at auction, dealers and classifieds.`, L);
ok("each line holds one number and it is the rounded one (no per source number, no source count)", [L.searching, L.top].every(t => typeof t === "string" && (t.match(/\d[\d,]*\+?/g) || []).length === 1 && WORDS.test((t.match(/\d[\d,]*\+?/) || [""])[0])), L);
ok("the lines name no source and no count of sources", ![L.searching, L.top].some(t => /bring a trailer|cars & bids|dealer(?!s)|\bsources?\b|\bsites?\b/i.test(String(t || "").replace(/at auction, dealers and classifieds/, ""))), L);
ok("the per-search counts are untouched (all, auctions, dealers, classifieds)", ["all", "auctions", "dealers", "classifieds"].every(k => Number.isInteger(c[k])) && c.all === c.auctions + c.dealers + c.classifieds, c);
// the same total on the chat road
// 3 a visitor gets nothing: byte for byte what it was
reset(); const vis = W.json(await W.find({ q: "1987 Porsche 911" }, { crew: false }));
ok("a visitor's answer carries no forSale, no total and no line (FORSALE_PUBLIC is off)", !!vis && vis.forSale === undefined && !/vehicles for sale right now/.test(JSON.stringify(vis)), vis && Object.keys(vis).slice(0, 12));
// 4 the page: the top of Find and the searching sign
reset(); const crewPage = await W.call(BUYPAGE, "/find", { crew: true }), html = crewPage.body || "", visPage = await W.call(BUYPAGE, "/find", { crew: false }), vhtml = visPage.body || "";
const topM = /<p class="fs-total" id="fs-total">([^<]*)<\/p>/.exec(html);
ok("the top of Find prints the engine's top line, as sent (crew)", !!topM && topM[1] === L.top, topM && topM[1]);
ok("the top line sits above the landing, inside the page's column", /<div class="col"><p class="fs-total"/.test(html));
const sl = /var SEARCH_LINE = "([^"]*)";/.exec(html);
ok("the searching sign says the engine's searching line (crew)", !!sl && sl[1] === L.searching, sl && sl[1]);
ok("the sign no longer cycles site names for the crew when the engine serves the line", !!sl && !/\{site\}/.test(sl[1]));
ok("a visitor's page has no total, no sign line and no change (the old cycling sign)", !/fs-total|vehicles for sale right now/.test(vhtml) && /var SEARCH_LINE = "Sam is searching \{site\} for your car";/.test(vhtml));
// 5 the page does not compute: its source holds no rounding, no sum and no wording of the count
{ const pg = fs.readFileSync(path.join(root, "lib/forSalePage.js"), "utf8"), by = fs.readFileSync(path.join(root, "api/buy.js"), "utf8");
  ok("lib/forSalePage.js prints lines.top and lines.searching only: no rounding, no sum, no word of its own", /lines\.top/.test(pg) && /lines\.searching/.test(pg) && !/Math\.(floor|round|ceil)\(\s*[^)]*total/.test(pg) && !/vehicles for sale/.test(pg.replace(/\/\/[^\n]*/g, "")));
  ok("api/buy.js asks the engine for the count and prints no wording of it", /forSaleTotal\(/.test(by) && !/vehicles for sale right now/.test(by)); }
// 6 the engine's words are one place: reasonWords
{ const rw = fs.readFileSync(path.join(root, "lib/reasonWords.js"), "utf8"); ok("the two lines are in the engine's word table", /"forsale\.total_searching"/.test(rw) && /"forsale\.total_top"/.test(rw)); }
say(`vehicleCountCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);

function mutants() {
  const copy = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "vcc-")); spawnSync("cp", ["-R", root, copy + "/t"], { stdio: "ignore" }); const T = copy + "/t"; try { fs.rmSync(T + "/node_modules", { force: true }); fs.symlinkSync(path.join(root, "node_modules"), T + "/node_modules"); } catch {}
  const cases = [
    ["the total is not rounded down (exact)", "lib/forsale/total.js", "export const floorThousand = n => Math.floor(Math.max(0, Number(n) || 0) / 1000) * 1000;", "export const floorThousand = n => Math.max(0, Number(n) || 0);"],
    ["the total is rounded up", "lib/forsale/total.js", "export const floorThousand = n => Math.floor(Math.max(0, Number(n) || 0) / 1000) * 1000;", "export const floorThousand = n => Math.ceil(Math.max(0, Number(n) || 0) / 1000) * 1000 + 1000;"],
    ["a count under a thousand is still served", "lib/forsale/total.js", "total >= 1000", "total >= 0"],
    ["the total counts only the auctions", "lib/forsale/total.js", "const all = g && g.counts ? Number(g.counts.all) : NaN;", "const all = g && g.counts ? Number(g.counts.auctions) : NaN;"],
    ["the searching line says another sentence", "lib/reasonWords.js", "`Searching ${p.total} vehicles for sale right now`", "`Sam is searching ${p.total} vehicles`"],
    ["the top line drops the three kinds", "lib/reasonWords.js", ", at auction, dealers and classifieds.`", ".`"],
    ["a visitor's answer is given a forSale of its own", "lib/forsale/total.js", "if (!forSale || !forSale.counts) return forSale;", "if (!forSale) forSale = { counts: {} };"],
    ["the page does not print the top line", "lib/forSalePage.js", "const line = forSaleOn(crew) && total && total.lines && typeof total.lines.top === \"string\" ? total.lines.top : \"\";", "const line = \"\";"],
    ["the page keeps the cycling sign", "lib/forSalePage.js", "if (said && s.includes(TOTAL_ANCHOR)", "if (false && said && s.includes(TOTAL_ANCHOR)"],
    ["the page words the count itself", "lib/forSalePage.js", "typeof total.lines.top === \"string\" ? total.lines.top : \"\";", "typeof total.lines.top === \"string\" ? total.total.toLocaleString() + \" vehicles for sale right now\" : \"\";"],
    ["the search answer carries no total", "api/buySearch.js", "const forSale = await withTotal(env, await forSaleFor(", "const forSale = await (async x => x)(await forSaleFor("],
  ];
  let missed = 0;
  for (const [name, file, from, to] of cases) {
    const p = path.join(T, file), src = fs.readFileSync(p, "utf8"); if (!src.includes(from)) { console.log("SKIP (target not in " + file + " exactly once): " + name); missed++; continue; }
    fs.writeFileSync(p, src.replace(from, () => to)); const r = spawnSync("node", [path.join(T, "scripts/vehicleCountCheck.mjs"), T], { encoding: "utf8", timeout: 240000 }); fs.writeFileSync(p, src);
    const caught = r.status !== 0; console.log((caught ? "caught   " : "MISSED   ") + name); if (!caught) missed++;
  }
  fs.rmSync(copy, { recursive: true, force: true }); console.log(`vehicleCountCheck mutants: ${missed} not caught`); return missed ? 1 : 0;
}
