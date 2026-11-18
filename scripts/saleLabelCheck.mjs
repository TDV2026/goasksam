// saleLabelCheck (Lane S, Nov 17 2026): the sale card label on the Market Check result (lib/saleLabelPage.js), CREW ONLY behind SALE_LABEL_PUBLIC, through the live handler (api/marketCheck.js, NEW_DESIGN=1, the crew cookie) in Chrome, from a recorded engine answer
// (scripts/fixtures/mcSell/mc-1995-porsche-911.json) reshaped into a 1987 Firebird of mixed variants. THE SHAPE the page reads (Lane B serves it; docs/lane-notes.md MISSING FIELD): every sale row carries  saleLine: "<the engine's words>"  beside its id.
//   1 THE LINE: every card prints the engine's saleLine as sent, ABOVE the price (label, then price, then the meta lines); mixed variants read apart; an unstated sale reads "1987 Firebird"; a replica reads "1987 Firebird Replica"; a set aside tile prints its own
//   2 THE ENGINE'S WORDS, NOT THE TITLE'S: a card whose listing title says Trans Am GTA while the engine says "1987 Firebird" prints the engine's words
//   3 NOTHING TO PRINT: a card with no saleLine, an empty one, a blank one, one that is not a string: no line and the card is otherwise the same
//   4 THE OTHER CARDS OF THE PAGE: the three cards of "Sales behind this answer" (a pool over sixteen) print the line too
//   5 A LATER ANSWER: one with no saleLine takes the lines away
//   6 ONE LINE: at 390 and 1440 no sideways scroll, every line on one row, in the card's own meta type
//   7 THE SOURCE COMPUTES NOTHING: no title read, sort, sum, year or word added; 8 THE SWEEP: every file that draws a sale card is named (the class), the labelled one and the ones left for their own branch
//   9 A VISITOR gets the same bytes until the switch is on
//   MUTANTS (in a copy of the worktree): node scripts/saleLabelCheck.mjs --mutants        node scripts/saleLabelCheck.mjs [--shots]     offline; Chrome
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) { console.log("saleLabelCheck: SKIP no Chrome"); process.exit(0); }
const FILES = { sl: "lib/saleLabelPage.js", bar: "lib/carBar.js" };
if (process.argv.includes("--mutants")) {
  const MUT = [
    ["the line printed under the price", FILES.sl, "at.parentNode.insertBefore(p,at)", "at.parentNode.insertBefore(p,at.nextSibling)"],
    ["the line read from the card's title", FILES.sl, 'line=map[id],old=', 'line=map[id]||(el.querySelector(".thin-tile-title,.salescard-title")||{}).textContent,old='],
    ["a card with no saleLine given the year and model", FILES.sl, "if(!line){if(old)old.remove();continue}", 'if(!line){line="1987 Firebird"}'],
    ["a blank saleLine accepted", FILES.sl, 'typeof o.saleLine==="string"&&o.saleLine.trim())map[String(o.id)]=o.saleLine.trim();', 'typeof o.saleLine==="string")map[String(o.id)]=o.saleLine;'],
    ["a stale line kept when a later answer has none", FILES.sl, "if(isAnswer(j)||(j&&isAnswer(j.answer)))map={};", ""],
    ["the line trimmed to a word", FILES.sl, "p.textContent=line;p.title=line;", "p.textContent=line.split(' ').slice(0,2).join(' ');p.title=line;"],
    ["the line wrapped", FILES.sl, "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%", "white-space:normal"],
    ["the line in the wrong type", FILES.sl, ".sale-line{margin:0 0 2px;font:400 13px/1.35 var(--sans)", ".sale-line{margin:0 0 2px;font:700 19px/1.35 var(--serif)"],
    ["the other cards left out", FILES.sl, ".thin-tile[data-gas-listing-id],.salescard[data-gas-listing-id]", ".thin-tile[data-gas-listing-id]"],
    ["the set aside tiles left out", FILES.sl, ".thin-tile[data-gas-listing-id],.salescard", ".thin-tile:not(.thin-tile-aside)[data-gas-listing-id],.salescard"],
    ["the module added for a visitor", FILES.sl, "(!SALE_LABEL_PUBLIC && isCrewRequest(req) !== true)", "false"],
    ["the switch on", FILES.sl, "export const SALE_LABEL_PUBLIC = false;", "export const SALE_LABEL_PUBLIC = true;"],
    ["the module not wired into the page", FILES.bar, "return saleLabelFinish(modelChoiceFinish(", "return (modelChoiceFinish("],
    ["the module on every tool", FILES.sl, 'if (tool !== "mc" || (!SALE_LABEL_PUBLIC', 'if ((!SALE_LABEL_PUBLIC'],
    ["the phone grid left three across", FILES.sl, ".thin-tiles-wide.sl-on{grid-template-columns:repeat(2,minmax(0,1fr))}", ".thin-tiles-wide.sl-on{}"],
    ["a line wider than the card", FILES.sl, ".sale-line{margin:0 0 2px;", ".sale-line{min-width:900px;margin:0 0 2px;"],
  ];
  let bad = 0;
  for (const [name, file, from, to] of MUT) {
    const f = path.join(ROOT, file), src = fs.readFileSync(f, "utf8");
    if (src.split(from).length !== 2) { console.log("MISSED  " + name + " (the target text is not in " + file + " exactly once)"); bad++; continue; }
    fs.writeFileSync(f, src.replace(from, () => to));
    let caught = false; try { execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ROOT, stdio: "pipe", timeout: 600000, env: { ...process.env } }); } catch { caught = true; } finally { fs.writeFileSync(f, src); }
    console.log((caught ? "caught   " : "MISSED   ") + name); if (!caught) bad++;
  }
  console.log(bad ? "saleLabelCheck mutants: " + bad + " not caught" : "saleLabelCheck mutants: all " + MUT.length + " caught"); process.exit(bad ? 1 : 0);
}
process.env.NEW_DESIGN = "1"; process.env.CURTAIN_CREW_CODE = process.env.CURTAIN_CREW_CODE || "fixture-crew-code"; process.env.LAUNCH_STAGE = "2";
const H = await import(pathToFileURL(path.join(ROOT, "scripts/mcSellHarness.mjs")).href), { open, launch, loadFixtures } = H;
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
let SL = null, CB = null, MCH = null, mint = null;
try { SL = await imp("lib/saleLabelPage.js"); } catch (e) { ok(false, "lib/saleLabelPage.js loads :: " + String(e.message).slice(0, 100)); }
CB = await imp("lib/carBar.js"); MCH = (await imp("api/marketCheck.js")).default; mint = (await imp("lib/_crew.js")).mintCrewCookieValue;
const base = loadFixtures("mc-1995-porsche-911"), KEY = Object.keys(base).find(k => /^POST \/api\/sellerDecision/.test(k)), J0 = JSON.parse(base[KEY].body);
const URL0 = "/market-check?q=1995%20Porsche%20911";
// THE ENGINE'S WORDS for eleven sales of a 1987 Firebird: mixed variants, an unstated one, a replica; the listing titles are the fixture's own (a Porsche), so any line read from a title is plainly wrong
const LINES = ["1987 Trans Am GTA", "1987 Trans Am", "1987 Firebird", "1987 Trans Am GTA", "1987 Formula", "1987 Firebird Replica", "1987 Trans Am", "1987 Firebird", "1987 Trans Am GTA", "1987 Firebird", "1987 SE"];
const TRAP = 2;   // card 2: its listing title says Trans Am GTA, the engine says "1987 Firebird"
const shaped = (n, lines, mut) => { const j = JSON.parse(JSON.stringify(J0)); j.resolvedCar = { year: 1987, make: "Pontiac", model: "Firebird" }; j.cards = j.cards.slice(0, n).map((c, i) => { const x = { ...c }; if (lines[i] !== undefined) x.saleLine = lines[i]; if (i === TRAP) x.title = "1987 Pontiac Firebird Trans Am GTA"; return x; });
  j.setAsideRows = []; if (mut) mut(j); const f = { ...base }; f[KEY] = { ...base[KEY], body: JSON.stringify(j) }; return [f, j]; };
const READ = () => { const tiles = [...document.querySelectorAll(".thin-tile, .salescard")]; return { n: tiles.length, overflow: document.documentElement.scrollWidth - innerWidth, vw: innerWidth,
  tiles: tiles.map(t => { const l = t.querySelector(".sale-line"), body = t.querySelector(".thin-tile-body,.salescard-body"), pr = t.querySelector(".thin-tile-price,.salescard-price"), mt = t.querySelector(".thin-tile-meta,.salescard-meta"), lr = l && l.getBoundingClientRect(), tr = t.getBoundingClientRect(), cs = l && getComputedStyle(l), ms = mt && getComputedStyle(mt);
    return { id: t.getAttribute("data-gas-listing-id"), aside: t.classList.contains("thin-tile-aside"), line: l ? l.textContent : null, above: !!(l && pr && l.compareDocumentPosition(pr) & 4), oneRow: !!l && lr.height <= parseFloat(cs.lineHeight) * 1.5, clipped: !!l && l.scrollWidth > l.clientWidth + 1, first: !!l && !!body && body.firstElementChild === l, wd: l ? [Math.round(lr.width), Math.round(tr.width), l.scrollWidth, l.clientWidth] : null, inside: !!l && lr.right <= tr.right + 1 && lr.left >= tr.left - 1,
      font: cs ? cs.fontSize + " " + cs.fontFamily.split(",")[0] : null, metaFont: ms ? ms.fontSize + " " + ms.fontFamily.split(",")[0] : null, text: t.textContent.replace(/\s+/g, " ").trim().slice(0, 140) }; }) }; };
const b = await launch();
const view = async (fx, w = 1440) => { const p = await open(b, URL0, { width: w, fixtures: fx, settle: 3500 }); const r = await p.evaluate(READ); return [p, r]; };
async function call(handler, url, crew) { const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, writeHead(c) { this.code = c; return this; }, status(c) { this.code = c; return this; }, json(o) { this.body = JSON.stringify(o); return this; }, send(x) { this.body = String(x); return this; }, end(x) { if (x != null) this.body += String(x); return this; } };
  const u = new URL(url, "https://goasksam.com"), log = console.log, err = console.error; console.log = () => {}; console.error = () => {};
  try { await handler({ method: "GET", url, query: Object.fromEntries(u.searchParams), headers: { cookie: crew ? "gas_crew=" + mint() : "", host: "goasksam.com" }, socket: {}, body: null }, res); } finally { console.log = log; console.error = err; } return res; }
// 0 the page as served
{ const res = await call(MCH, URL0, true); ok(res.code === 200 && res.h["x-design"] === "new" && /id="sl-mod"/.test(res.body) && /id="sl-css"/.test(res.body), "the live handler with the new design on serves Market Check with the sale label module to the crew :: " + res.code + " " + (res.h["x-design"] || "none")); }
// 1 and 2 the eleven cards
{ const [fx, j] = shaped(11, LINES), [p, r] = await view(fx);
  ok(r.n === 11, "eleven sale cards are drawn :: " + r.n);
  const byId = Object.fromEntries(j.cards.map(c => [String(c.id), c.saleLine]));
  ok(r.tiles.every(t => t.line === byId[t.id]), "every card prints the engine's saleLine exactly as sent :: " + JSON.stringify(r.tiles.map(t => t.line)));
  ok(r.tiles.every(t => t.above), "the line sits above the price on every card");
  ok(new Set(r.tiles.map(t => t.line)).size >= 6, "mixed variants read apart (Trans Am GTA, Trans Am, Formula, SE, Firebird, Replica) :: " + [...new Set(r.tiles.map(t => t.line))].join(" | "));
  ok(r.tiles.filter(t => t.line === "1987 Firebird").length === 3, "an unstated sale reads \"1987 Firebird\"");
  ok(r.tiles.some(t => t.line === "1987 Firebird Replica"), "a replica reads \"1987 Firebird Replica\"");
  const trap = r.tiles.find(t => t.id === String(j.cards[TRAP].id)); ok(trap && trap.line === "1987 Firebird" && !/Trans Am GTA/.test(trap.line), "the engine's words beat the listing title (the title said Trans Am GTA, the line says 1987 Firebird) :: " + (trap && trap.line));
  ok(r.tiles.every(t => t.first), "the line is the first thing in the card's body, above the price");
  ok(!p._err.length, "no page error :: " + p._err.join("|")); await p.close(); }
// a set aside tile prints its own line
{ const [fx, j] = shaped(11, LINES, j => { const a = { ...j.cards[0], id: "aside-1", saleLine: "1987 Firebird Project", reason: "a project car" }; j.setAsideRows = [a]; j.asideCards = [a]; }); const [p, r] = await view(fx);
  const a = r.tiles.find(t => t.aside); ok(a && a.line === "1987 Firebird Project", "a set aside tile prints the engine's set aside word line :: " + JSON.stringify(a && [a.aside, a.line])); await p.close(); }
// 3 nothing to print
{ const L = [...LINES]; L[0] = undefined; L[1] = ""; L[3] = "   "; L[4] = 7; L[5] = null; const [fx, j] = shaped(11, L), [p, r] = await view(fx);
  const none = [0, 1, 3, 4, 5].map(i => r.tiles.find(t => t.id === String(j.cards[i].id)));
  ok(none.every(t => t && t.line === null), "a card with no saleLine, an empty one, a blank one, a number or null has no line :: " + JSON.stringify(none.map(t => t && t.line)));
  ok(r.tiles.filter(t => t.line !== null).length === 6 && r.tiles.filter(t => t.line !== null).every(t => t.line === j.cards.find(c => String(c.id) === t.id).saleLine), "the cards that have a line still print it");
  ok(none.every(t => t && /\$/.test(t.text)), "a card with no line is otherwise the same (its price is there)"); await p.close(); }
// 4 the other cards of the page: a pool over sixteen draws the three cards of "Sales behind this answer"
{ const [fx, j] = shaped(41, Array.from({ length: 41 }, (_, i) => LINES[i % LINES.length])), [p, r] = await view(fx);
  const sc = r.tiles; ok(sc.length >= 3 && sc.every(t => t.line && t.above), "the cards of \"Sales behind this answer\" print the line above the price :: " + JSON.stringify(sc.map(t => t.line))); await p.close(); }
// 4b the cards of "Sales behind this answer" with no saleLine print no line (the card's own title is never used)
{ const [fx] = shaped(41, []), [p, r] = await view(fx); ok(r.tiles.length >= 3 && r.tiles.every(t => t.line === null), "the cards of \"Sales behind this answer\" with no saleLine have no line (the title is not used) :: " + JSON.stringify(r.tiles.map(t => t.line))); await p.close(); }
// 4c a line longer than the card stays on one row, cut by an ellipsis, the whole line in its title
{ const LONG = "1987 Pontiac Firebird Trans Am GTA Anniversary Edition Special"; const L = [...LINES]; L[0] = LONG; const [fx, j] = shaped(11, L), [p, r] = await view(fx, 390);
  const t = r.tiles.find(x => x.id === String(j.cards[0].id)), full = await p.evaluate(() => document.querySelector(".sale-line").title);
  ok(t && t.line === LONG && t.oneRow && t.clipped && t.inside && full === LONG, "a line longer than the card stays on one row inside the card, cut by an ellipsis, with the whole line in its title :: " + JSON.stringify(t && [t.oneRow, t.clipped, t.inside, full])); await p.close(); }
// 5 a later answer with no saleLine takes the lines away
{ const NEXT = '{"probe":2}', [fx, j] = shaped(11, LINES), j1 = JSON.parse(JSON.stringify(j)); j1.cards.forEach(c => { delete c.saleLine; });
  fx["POST /api/sellerDecision " + NEXT] = { status: 200, contentType: "application/json", body: JSON.stringify(j1) };
  const p = await open(b, URL0, { width: 1440, fixtures: fx, settle: 3000 }), r0 = await p.evaluate(READ);
  await p.evaluate(b2 => fetch("/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: b2 }).then(r => r.json()).then(() => new Promise(r => setTimeout(r, 800))), NEXT);
  const n0 = r0.tiles.filter(t => t.line).length, n1 = await p.evaluate(() => document.querySelectorAll(".sale-line").length);
  ok(n0 === 11 && n1 === 0, "a later answer with no saleLine takes the lines away :: " + n0 + " then " + n1); await p.close(); }
// 6 one line, the card's own type; phone and desktop
for (const w of [390, 1440]) { const [fx] = shaped(11, LINES), [p, r] = await view(fx, w);
  ok(r.overflow <= 0, "at " + w + " px no sideways scroll :: " + r.overflow);
  ok(r.tiles.length === 11 && r.tiles.every(t => t.oneRow && !t.clipped && t.inside), "at " + w + " px every line is on one row, whole and inside its card :: " + JSON.stringify(r.tiles.filter(t => !(t.oneRow && !t.clipped && t.inside)).map(t => [t.line, t.oneRow, t.clipped, t.inside, t.wd])));
  ok(r.tiles.every(t => t.font === t.metaFont), "at " + w + " px the line has the card's own meta type :: " + JSON.stringify([r.tiles[0].font, r.tiles[0].metaFont]));
  if (process.argv.includes("--shots")) { await p.evaluate(() => { const c = document.querySelector(".thin-tile"); if (c) { c.scrollIntoView({ block: "start" }); window.scrollBy(0, -140); } }); await new Promise(r => setTimeout(r, 400)); await p.screenshot({ path: path.join(ROOT, "docs/demo-run/sale-card-label-" + (w === 390 ? "phone-390" : "desktop-1440") + ".png") }); }
  await p.close(); }
// 7 the source computes nothing
if (SL) { const src = SL.SALE_LABEL_JS; ok(!/\.sort\(|\.reduce\(|Math\.|parseInt|parseFloat|Number\(|\.match\(|\.replace\(|\.split\(|\.title\b/.test(src.replace(/p\.title=line/, "")), "the module has no sort, sum, regex, split or title read (it prints saleLine and nothing else)");
  ok(!/\.year|\.make|\.model|Replica|Trans/.test(src), "the module names no year, make, model or variant word"); }
// 8 the sweep: every file that draws a sale card or a sale row is named
{ const MARKS = ['class="thin-tile"', "class=\"thin-tile", 'class="salescard"', "class=\"salescard", 'class="sfc-row"', "class=\\\"sfc-row", "saleRowHtml", "View the sale", "partner-sale-row", "placedSales"];
  const REG = {
    "public/js/onebox.js": "LABELLED on Market Check by lib/saleLabelPage.js (thin tiles, Sales behind this answer cards); the same file draws /onebox, left as it is",
    "lib/sellsForCard.js": "swept, NOT changed here: the shared card's sale rows (Find See the sales, Sell sales list, Buy); its own branch",
    "lib/live/watches.js": "swept, NOT changed here: the watch email's sale card (View the sale); emails are their own branch",
    "lib/onebox.js": "swept, NOT changed here: the engine (the field Lane B serves) and the email cards it builds",
    "lib/saleLabelPage.js": "the module itself",
    "api/partnerAnswer.js": "swept, NOT changed here: the partner answer's sale rows",
    "api/partnerDemo.js": "swept, NOT changed here: the partner demo's sale rows",
    "api/_amazonDemo.js": "swept, NOT changed here: the marketplace demo's sale rows",
    "lib/placedSale.js": "swept, NOT changed here: the partner answer's placed sales",
  };
  const hits = []; const walk = d => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { if (e.name === "node_modules" || e.name.startsWith(".") || /^(fixtures|demo-run|proofs)$/.test(e.name)) continue; const rel = d + "/" + e.name; if (e.isDirectory()) walk(rel); else if (/\.(js|mjs|html)$/.test(e.name)) { const s = fs.readFileSync(path.join(ROOT, rel), "utf8"); if (MARKS.some(m => s.includes(m))) hits.push(rel); } } };
  for (const d of ["lib", "api", "public"]) walk(d);
  const missing = hits.filter(h => !REG[h] && !/^(scripts|docs)\//.test(h)); ok(missing.length === 0, "every file that draws a sale card or row is named in the sweep (a new one fails until it is named) :: " + JSON.stringify(missing));
  ok(Object.keys(REG).every(k => fs.existsSync(path.join(ROOT, k))), "every file the sweep names exists"); }
// 9 a visitor
if (SL) { const vis = await call(MCH, URL0, false), crewRes = await call(MCH, URL0, true), req0 = { headers: { host: "goasksam.com" }, url: URL0 };
  ok(vis.code === 200 && !/sl-mod|sl-css|saleLine/.test(vis.body) && /id="gas-carbar"/.test(vis.body), "a visitor's Market Check page has the car bar and no sale label module");
  ok(SL.saleLabelFinish(vis.body, req0, "mc") === vis.body && !/sl-mod/.test(CB.carBarFinish(vis.body, req0, "mc")), "for a visitor the label finish returns the page byte for byte and the bar's finish adds no label");
  ok(SL.SALE_LABEL_PUBLIC === false, "the switch is off");
  ok(["buy", "find", "sell", "tasks"].every(t => SL.saleLabelFinish("<body>x</body>", { headers: { cookie: "gas_crew=" + mint(), host: "goasksam.com" }, url: "/" }, t) === "<body>x</body>"), "the module is on Market Check only (not Buy, Find, Sell, Tasks), crew or not");
  ok(crewRes.body.length > vis.body.length, "the crew's page carries the module on top of the visitor's"); }
await b.close();
console.log(out.join("\n")); console.log("saleLabelCheck: " + pass + " pass, " + fail + " FAIL"); process.exit(fail ? 1 : 0);
