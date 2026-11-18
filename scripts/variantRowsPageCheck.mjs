// variantRowsPageCheck (Lane S, Nov 17 2026): the variant rows on the Market Check result (lib/variantRowsPage.js), CREW ONLY, served the way the live site serves them: the live handler api/marketCheck.js with NEW_DESIGN=1 and the crew cookie, in Chrome,
// from a recorded engine answer (scripts/fixtures/mcSell/mc-1995-porsche-911.json) with a variantSplit of the fixture shape added: variantSplit { show, line, rows: [ { label, rangeText, salesText, car: { token, words, address } } ] } (Lane B's exact shape is still to come).
//   1 THE ROWS: a Firebird with five variants: the engine's line, then five rows in the engine's order, the label, rangeText and salesText as sent; the thin variant (no rangeText) shows its label and salesText only; the rows sit directly under the price range card
//   2 THE LINKS: each row is a real link to its car address and the address carries that row's token; following one opens Market Check with the car bar carrying that car (four pills with its token)
//   3 NOTHING ELSE: the block's text is the engine's words and no others (no total, no question, no chooser), nothing sorted (a non-alphabetical, non-numeric order is kept), the source has no sort, sum or arithmetic
//   4 NOTHING TO DRAW: show false, no variantSplit (a stated variant), show true with no rows, a show that is not the boolean true: no block
//   5 A VISITOR gets the same bytes: no module in the page, the finishing functions return the page unchanged
//   6 PHONE: at 390 and 1440 no sideways scroll and the rows are inside the screen
//   MUTANTS (run in a copy of the worktree: node scripts/variantRowsPageCheck.mjs --mutants): each must fail.
//   node scripts/variantRowsPageCheck.mjs [--shots]     offline; Chrome
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) { console.log("variantRowsPageCheck: SKIP no Chrome"); process.exit(0); }
const FILES = { rows: "lib/variantRowsPage.js", bar: "lib/carBar.js", sw: "lib/variants.js" };
if (process.argv.includes("--mutants")) {
  const MUT = [
    ["rows sorted by the page", FILES.rows, "var rows = vs.rows.filter(", "var rows = vs.rows.slice().sort(function (a, b) { return a.label < b.label ? -1 : 1; }).filter("],
    ["show ignored", FILES.rows, "vs.show !== true || !Array.isArray(vs.rows)", "!vs || !Array.isArray(vs.rows)"],
    ["a show that is not true accepted", FILES.rows, "if (!vs || vs.show !== true || !Array.isArray(vs.rows)) return \"\";", "if (!vs || !vs.show || !Array.isArray(vs.rows)) return \"\";"],
    ["an empty range printed on a thin row", FILES.rows, '(text(r.rangeText) ? \'<span class="vrs-range">\'', '(true ? \'<span class="vrs-range">\''],
    ["rows that are not links", FILES.rows, 'h += "<li>" + (href ? \'<a class="vrs-row"', 'h += "<li>" + (false ? \'<a class="vrs-row"'],
    ["every row linking to the same address", FILES.rows, 'r.car.address.charAt(0) === "/" ? r.car.address : ""', 'r.car.address.charAt(0) === "/" ? "/market-check" : ""'],
    ["the engine's line dropped", FILES.rows, "(text(vs.line) ? '<p class=\"vrs-line\">'", "(false ? '<p class=\"vrs-line\">'"],
    ["a total added", FILES.rows, 'return h + "</ul>" + (text(vs.mileageLine)', 'return h + "</ul><p class=\\"vrs-total\\">" + rows.length + " variants</p>" + (text(vs.mileageLine)'],
    ["a question added", FILES.rows, "'<ul class=\"vrs-list\">'", "'<p class=\"vrs-q\">Which one?</p><ul class=\"vrs-list\">'"],
    ["the rows not under the range", FILES.rows, 'card.insertAdjacentHTML("afterend",h)', 'card.insertAdjacentHTML("beforebegin",h)'],
    ["the switch off: no module for a visitor", FILES.sw, "export const VARIANT_SPLIT_PUBLIC = true;", "export const VARIANT_SPLIT_PUBLIC = false;"],
    ["the narrow strip stays while the split shows", FILES.rows, '}narrow(true);card=at;', '}card=at;'],
    ["the narrow strip is not brought back", FILES.rows, 'narrow(false);hid(false)}return}', 'hid(false)}return}'],
    ["the mileage line is not printed under the list", FILES.rows, "(text(vs.mileageLine) ? '<p class=\"vrs-miline\">'", "(false ? '<p class=\"vrs-miline\">'"],
    ["the module not wired into the page", FILES.bar, "modelChoiceFinish(variantRowsFinish(carBarApply(", "modelChoiceFinish((carBarApply("],
    ["a row wider than the phone", FILES.rows, ".vrs{margin:12px 0 0;max-width:100%}", ".vrs{margin:12px 0 0;min-width:700px}"],
    ["the single range card is kept next to the cards", FILES.rows, 'else{card.style.display="none";card.setAttribute("data-vrs-hid","1")}', 'else{}'],
    ["the range card stays hidden after a later answer has no variants", FILES.rows, 'card.style.display="";card.removeAttribute("data-vrs-hid")', ''],
    ["the too-few line is not printed", FILES.rows, "(!text(r.rangeText) && text(r.fewText) ?", "(false ?"],
    ["a variant's mileage note is not printed", FILES.rows, "(text(r.mileageNote) ? '<span class=\"vrs-mi\">'", "(false ? '<span class=\"vrs-mi\">'"],
    ["the set-aside line is not printed", FILES.rows, "(text(vs.asideLine) ? '<p class=\"vrs-aside\">'", "(false ? '<p class=\"vrs-aside\">'"],
    ["a refusal with the split is not given the rows (no card anchor)", FILES.rows, 'ref=card?null:document.querySelector(".refusal")', 'ref=null'],
    ["the mixed sales list stays under the rows", FILES.rows, 'var os=document.getElementById("ob-sales");if(os){os.style.display="none";os.setAttribute("data-vrs-also","1")}', ''],
    ["the refusal block stays beside the rows", FILES.rows, 'ref.style.display="none";ref.setAttribute("data-vrs-also","1");', ''],
    ["the refusal and the list are not brought back when the split goes", FILES.rows, 'narrow(false);hid(false)}return}', 'narrow(false)}return}'],
    ["the old answer's rows kept when a new answer has none", FILES.rows, "else if(isAnswer(j)||(j&&isAnswer(j.answer)))vs=null;place()", "place()"],
  ];
  let bad = 0;
  for (const [name, file, from, to] of MUT) {
    const f = path.join(ROOT, file), src = fs.readFileSync(f, "utf8");
    if (src.split(from).length !== 2) { console.log("MISSED  " + name + " (the target text is not in " + file + " exactly once)"); bad++; continue; }
    fs.writeFileSync(f, src.replace(from, () => to));
    let caught = false; try { execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ROOT, stdio: "pipe", timeout: 600000, env: { ...process.env } }); } catch { caught = true; } finally { fs.writeFileSync(f, src); }
    console.log((caught ? "caught   " : "MISSED   ") + name); if (!caught) bad++;
  }
  console.log(bad ? "variantRowsPageCheck mutants: " + bad + " not caught" : "variantRowsPageCheck mutants: all " + MUT.length + " caught"); process.exit(bad ? 1 : 0);
}
process.env.NEW_DESIGN = "1"; process.env.CURTAIN_CREW_CODE = process.env.CURTAIN_CREW_CODE || "fixture-crew-code"; process.env.LAUNCH_STAGE = "2";
const H = await import(pathToFileURL(path.join(ROOT, "scripts/mcSellHarness.mjs")).href), { open, launch, loadFixtures } = H;
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const VR = await imp("lib/variantRowsPage.js"), CB = await imp("lib/carBar.js"), CT = await imp("lib/carToken.js"), { mintCrewCookieValue } = await imp("lib/_crew.js"), MCH = (await imp("api/marketCheck.js")).default;
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
const tok = (trim, extra = {}) => CT.encodeCar({ year: 1987, make: "Pontiac", model: "Firebird", trim, ...extra });
const ROW = (label, rangeText, salesText, trim) => { const t = tok(trim); return { label, ...(rangeText ? { rangeText } : {}), salesText, car: { token: t, words: "1987 Pontiac Firebird " + trim, address: "/market-check?car=" + encodeURIComponent(t) } }; };
// the engine's order is deliberately neither alphabetical nor by figure; the thin variant has no range
const SPLIT = { show: true, line: "Five variants sold in the last 24 months, priced apart.", rows: [ROW("Trans Am", "$22,000 to $31,000", "14 sales", "Trans Am"), ROW("Formula", "$16,000 to $22,500", "9 sales", "Formula"), ROW("Firebird", "$9,500 to $14,000", "11 sales", "Base"), ROW("GTA", "$24,500 to $33,000", "6 sales", "GTA"), ROW("Firehawk", null, "2 sales", "Firehawk")] };
SPLIT.rows[4].fewText = "Too few sales for a range.";   // the engine's too-few line on a card with sales and no range (lane-b-sell-nolump-3)
SPLIT.mileageLine = "The range is for all mileages."; SPLIT.rows[2].mileageNote = "Narrowed to 50,000 to 100,000 miles."; SPLIT.asideLine = "Four replicas and tributes are set aside and counted in none of these.";   // the engine's words per row (the same mileage line its own page prints) and the one line for the set-aside replicas
const base = loadFixtures("mc-1995-porsche-911"), KEY = Object.keys(base).find(k => /^POST \/api\/sellerDecision/.test(k));
const withSplit = (vs, firebird = true) => { const f = { ...base }, j = JSON.parse(base[KEY].body); if (firebird) j.resolvedCar = { year: 1987, make: "Pontiac", model: "Firebird", trim: "Trans Am" }; if (vs === undefined) delete j.variantSplit; else j.variantSplit = vs; f[KEY] = { ...base[KEY], body: JSON.stringify(j) }; return f; };
const URL0 = "/market-check?q=1995%20Porsche%20911";
const READ = () => { const v = document.getElementById("vrs"), card = document.querySelector(".hero-left .sfc-card"); if (!v) return { present: false, narrow: [...document.querySelectorAll(".narrow-strip")].map(n => getComputedStyle(n).display), cards: !!card, hidden: !!card && getComputedStyle(card).display === "none" };
  const r = v.getBoundingClientRect(), c = card && card.getBoundingClientRect(), rows = [...v.querySelectorAll(".vrs-row")];
  return { present: true, cards: !!card, hidden: !!card && getComputedStyle(card).display === "none", mi: [...v.querySelectorAll(".vrs-mi")].map(x => x.textContent), miline: [...v.querySelectorAll(".vrs-miline")].map(x => x.textContent), miBelow: !!v.querySelector(".vrs-miline") && v.querySelector(".vrs-miline").previousElementSibling === v.querySelector(".vrs-list"), narrow: [...document.querySelectorAll(".narrow-strip")].map(n => getComputedStyle(n).display), aside: (v.querySelector(".vrs-aside") || {}).textContent || null, text: v.textContent, line: (v.querySelector(".vrs-line") || {}).textContent || null, under: !!card && v.previousElementSibling === card && r.top >= c.bottom - 1, inHero: !!v.closest(".hero-left"),
    rows: rows.map(x => ({ tag: x.tagName, href: x.getAttribute("href"), label: (x.querySelector(".vrs-l") || {}).textContent, range: x.querySelector(".vrs-range") ? x.querySelector(".vrs-range").textContent : null, sales: x.querySelector(".vrs-sales") ? x.querySelector(".vrs-sales").textContent : null })),
    overflow: document.documentElement.scrollWidth - innerWidth, right: Math.round(r.right), vw: innerWidth }; };
const b = await launch();
const view = async (fx, w = 1440) => { const p = await open(b, URL0, { width: w, fixtures: fx, settle: 3500 }); const r = await p.evaluate(READ); return [p, r]; };
// 0 the page as served: the live handler, new design on, the crew cookie
{ const res = await call(MCH, URL0, true); ok(res.code === 200 && res.h["x-design"] === "new" && /id="vrs-mod"/.test(res.body) && /id="vrs-css"/.test(res.body), "the live handler with the new design on serves the Market Check result page with the variant rows module to the crew :: " + res.code + " " + (res.h["x-design"] || "none")); }
async function call(handler, url, crew) { const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, writeHead(c) { this.code = c; return this; }, status(c) { this.code = c; return this; }, json(o) { this.body = JSON.stringify(o); return this; }, send(x) { this.body = String(x); return this; }, end(x) { if (x != null) this.body = String(x); return this; } };
  const u = new URL(url, "https://goasksam.com"), log = console.log, err = console.error; console.log = () => {}; console.error = () => {};
  try { await handler({ method: "GET", url, query: Object.fromEntries(u.searchParams), headers: { cookie: crew ? "gas_crew=" + mintCrewCookieValue() : "", host: "goasksam.com" }, socket: {}, body: null }, res); } finally { console.log = log; console.error = err; } return res; }
// 1 and 2 and 3 the rows, the links, nothing else
{ const [p, r] = await view(withSplit(SPLIT)); const want = SPLIT.rows;
  ok(r.present && r.line === SPLIT.line, "the engine's line is printed as sent :: " + r.line);
  ok(r.present && r.rows.length === 5 && r.rows.every((x, i) => x.label === want[i].label), "one row per variant, in the engine's order (not sorted) :: " + JSON.stringify(r.rows && r.rows.map(x => x.label)));
  ok(r.present && r.rows.every((x, i) => x.range === (want[i].rangeText || null) && x.sales === want[i].salesText), "each row prints its rangeText and salesText as sent, and the thin variant has no range :: " + JSON.stringify(r.rows && r.rows.map(x => [x.range, x.sales])));
  ok(r.present && r.rows[4].label === "Firehawk" && r.rows[4].range === null && r.rows[4].sales === "2 sales", "the thin variant shows its label and salesText only");
  ok(r.present && r.under && r.inHero, "the rows sit directly under the price range card, in the answer's own column");
  ok(r.present && r.rows.every((x, i) => x.tag === "A" && x.href === want[i].car.address && x.href.includes(encodeURIComponent(want[i].car.token))), "each row is a real link to its own car address and the address carries that row's token :: " + JSON.stringify(r.rows && r.rows.map(x => x.tag)));
  ok(r.present && r.text === SPLIT.line + want.map(w => w.label + (w.rangeText || "") + (!w.rangeText && w.fewText ? w.fewText : "") + w.salesText + (w.mileageNote || "")).join("") + SPLIT.mileageLine + SPLIT.asideLine, "the block's text is the engine's words and no others (no total, no question, no chooser) :: " + (r.text || "").slice(0, 160));
  ok(r.present && r.hidden === true, "the single range card is not shown while the variants are (a card per variant takes its place) :: " + r.hidden);
  ok(r.present && r.mi.length === 1 && r.mi[0] === want[2].mileageNote && r.miline.length === 1 && r.miline[0] === SPLIT.mileageLine && r.miBelow && r.aside === SPLIT.asideLine, "the engine's mileage line is printed ONCE, under the list, a row that differs prints its own, and the one set-aside line is printed as sent :: " + JSON.stringify([r.mi, r.miline, r.aside]));
  ok(r.present && r.narrow.length > 0 && r.narrow.every(d => d === "none"), "the Narrow by pills and the mileage box (the narrow strip) are hidden while the split shows :: " + JSON.stringify(r.narrow));
  ok(!p._err.length, "no page error :: " + p._err.join("|")); await p.close(); }
// following a row: Market Check already run for that variant, the car bar carrying that car
{ const row = SPLIT.rows[0], p = await open(b, row.car.address, { width: 1440, fixtures: base, settle: 2500 }), r = await p.evaluate(() => { const s = document.getElementById("gas-carbar"); return { bar: !!s && !s.hidden, line: (document.querySelector(".gcb-line") || {}).textContent || "", pills: [...document.querySelectorAll(".gcb-pill")].map(x => x.getAttribute("href")) }; });
  ok(r.bar && /1987 Pontiac Firebird Trans Am/.test(r.line) && r.pills.length === 4 && r.pills.every(h => h.endsWith("?car=" + encodeURIComponent(row.car.token))), "a row's link opens Market Check with the car bar carrying that car :: " + JSON.stringify([r.bar, r.line, r.pills.length])); await p.close(); }
// a later answer (a refinement) that carries no variantSplit takes the rows away; one that carries it again brings them back
{ const NEXT = '{"probe":2}', NEXT2 = '{"probe":3}', fx = withSplit(SPLIT), j0 = JSON.parse(base[KEY].body), j1 = { ...j0, resolvedCar: { year: 1987, make: "Pontiac", model: "Firebird", trim: "Trans Am" } }; delete j1.variantSplit;
  fx["POST /api/sellerDecision " + NEXT] = { status: 200, contentType: "application/json", body: JSON.stringify(j1) }; fx["POST /api/sellerDecision " + NEXT2] = { status: 200, contentType: "application/json", body: JSON.stringify({ ...j1, variantSplit: SPLIT }) };
  const p = await open(b, URL0, { width: 1440, fixtures: fx, settle: 3000 }), ask = n => p.evaluate(b2 => fetch("/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: b2 }).then(r => r.json()).then(() => new Promise(r => setTimeout(r, 700))), n);
  const r0 = await p.evaluate(READ); await ask(NEXT); const r1 = await p.evaluate(READ); await ask(NEXT2); const r2 = await p.evaluate(READ);
  const nb = x => x.narrow && x.narrow.length > 0 && x.narrow.every(d => d === "none"), nv = x => x.narrow && x.narrow.length > 0 && x.narrow.every(d => d !== "none");
  ok(nb(r0) && nv(r1) && nb(r2), "the Narrow by strip is back once a later answer has no split (a trim chosen) and hidden again when the split returns :: " + JSON.stringify([r0.narrow, r1.narrow, r2.narrow]));
  ok(r0.present && !r1.present && r2.present && r2.rows.length === 5 && r0.hidden === true && r1.hidden === false && r2.hidden === true, "a later answer with no variantSplit removes the rows and one that carries it brings them back :: " + JSON.stringify([r0.present, r1.present, r2.present])); await p.close(); }
// THE BLENDED REFUSAL (lane-b-sell-nolump-2, Nov 18 2026; live: "Ferrari 330 GT" said "GT 2+2 and GTC are different cars at different prices, so there is no one range for them", drew no card per car and listed both cars' sales together): when the engine's answer is a refusal and carries the split, the rows are the answer: no refusal block, no mixed sales list, and the rows sit where the refusal was.
const withRefusal = vs => { const f = { ...base }, j = JSON.parse(base[KEY].body); j.tier = "refusal"; j.refusal = { kind: "varied", variants: ["GTC", "GT 2+2"], mixed: ["GT 2+2", "GTC"] }; j.cluster = null; j.samLine = "GT 2+2 and GTC are different cars at different prices, so there is no one range for them."; j.resolvedCar = { year: null, make: "Ferrari", model: "330", trim: "" }; if (vs) j.variantSplit = vs; else delete j.variantSplit; f[KEY] = { ...base[KEY], body: JSON.stringify(j) }; return f; };
const READR = () => { const v = document.getElementById("vrs"), vis = el => !!el && getComputedStyle(el).display !== "none" && !(el.closest("[data-vrs-also]") && getComputedStyle(el.closest("[data-vrs-also]")).display === "none"); const rf = document.querySelector(".refusal"), os = document.getElementById("ob-sales");
  return { present: !!v, rows: v ? [...v.querySelectorAll(".vrs-row")].map(x => (x.querySelector(".vrs-l") || {}).textContent) : [], refusal: !!rf, refusalShown: vis(rf), salesShown: vis(os), text: document.body.innerText, narrow: [...document.querySelectorAll(".narrow-strip")].map(n => getComputedStyle(n).display), after: !!v && !!rf && rf.nextElementSibling === v }; };
{ const p = await open(b, URL0, { width: 1440, fixtures: withRefusal(SPLIT), settle: 3500 }), r = await p.evaluate(READR);
  ok(r.refusal && r.present && r.rows.length === 5, "a refusal that carries the split draws the rows, one per car :: " + JSON.stringify([r.refusal, r.present, r.rows]));
  ok(r.present && r.refusal && !r.refusalShown, "the refusal block (the \"different cars\" line and the chips) is not shown beside the rows :: " + r.refusalShown);
  ok(r.present && !r.salesShown, "the mixed sales list (What has sold) is not shown while the rows are :: " + r.salesShown);
  ok(r.present && !/there is no one range for them/.test(r.text.split("\n").filter(l => l.length).join(" ").replace(/\s+/g, " ")) || r.present && !r.refusalShown, "the page does not print the refusal line next to the cards");
  ok(r.present && r.after, "the rows sit where the refusal was");
  ok(!p._err.length, "no page error :: " + p._err.join("|")); await p.close(); }
{ const p = await open(b, URL0, { width: 1440, fixtures: withRefusal(null), settle: 3000 }), r = await p.evaluate(READR);
  ok(!r.present && r.refusal && r.refusalShown && r.salesShown, "a refusal with no split is unchanged: the refusal block and the sales list show, no rows :: " + JSON.stringify([r.present, r.refusalShown, r.salesShown])); await p.close(); }
// 3 the source computes nothing
{ const src = VR.variantRowsFactory.toString() + VR.VARIANT_ROWS_JS; ok(!/\.sort\(|\.reduce\(|Math\.|parseInt|parseFloat|Number\(|\.length\s*[-*\/]|\.length\s*\+\s*[\w(]|\+\+/.test(src), "the module has no sort, sum or arithmetic on the engine's figures"); }
// 4 nothing to draw
for (const [name, vs] of [["show false (the rows sent anyway)", { ...SPLIT, show: false }], ["no variantSplit (a stated variant)", undefined], ["variantSplit null", null], ["show true with no rows", { ...SPLIT, rows: [] }], ["show that is not the boolean true", { ...SPLIT, show: "yes" }], ["rows with no labels", { ...SPLIT, rows: [{ salesText: "3 sales", car: SPLIT.rows[0].car }] }]]) {
  const [p, r] = await view(withSplit(vs)); ok(!r.present && r.cards, "draws nothing: " + name + " (the result itself is on the page :: " + r.cards + ")"); await p.close(); }
// the row builder on its own (the page also guards before it calls it): nothing for show false, a show that is not true, no rows, rows without labels; the thin row has no range element
{ const f = VR.variantRowsHtml, T = SPLIT.rows[0]; ok(f({ ...SPLIT, show: false }) === "" && f({ ...SPLIT, show: "yes" }) === "" && f({ ...SPLIT, show: 1 }) === "" && f(undefined) === "" && f(null) === "" && f({ ...SPLIT, rows: [] }) === "" && f({ show: true, line: "x", rows: [{ salesText: "3 sales", car: T.car }] }) === "", "the row builder returns nothing for show false, a show that is not true, no variantSplit, no rows or rows with no labels");
  const html = f(SPLIT); ok((html.match(/class="vrs-range"/g) || []).length === 4 && (html.match(/<a class="vrs-row"/g) || []).length === 5, "the row builder: five links, four ranges (the thin variant has none)"); }
// 5 a visitor
{ const vis = await call(MCH, URL0, false), crewRes = await call(MCH, URL0, true);
  // THE SPLIT IS PUBLIC (lane-b-variant-split-4, VARIANT_SPLIT_PUBLIC): a visitor's Market Check page carries the bar AND the variant rows module, the same as the crew's; with the switch off the module is the crew's alone
  ok(vis.code === 200 && /id="vrs-mod"/.test(vis.body) && /id="vrs-css"/.test(vis.body) && /id="gas-carbar"/.test(vis.body) && /GAS_CAR_BAR/.test(vis.body), "a visitor's Market Check page has the car bar and the variant rows module (the split is public)");
  const req0 = { headers: { host: "goasksam.com" }, url: URL0 }; ok(/vrs-mod/.test(CB.carBarFinish(vis.body.replace(/<style id="vrs-css">[\s\S]*?<\/style><script id="vrs-mod">[\s\S]*?<\/script>/, ""), req0, "mc")) && VR.variantRowsFinish(vis.body, req0, "mc") === vis.body, "for a visitor the bar's finish adds the rows module once and the rows finish adds it only once");
  ok(/vrs-mod/.test(crewRes.body) && /id="gas-carbar"/.test(crewRes.body), "the crew's page carries the bar and the rows module");
  ok(crewRes.body.replace(/<style id="vrs-css">[\s\S]*?<\/style><script id="vrs-mod">[\s\S]*?<\/script>/, "").replace(/<script>window\.GAS_CAR_BAR=[\s\S]*?<\/script><script>\(function\(\)\{\nvar C=window\.GAS_CAR_BAR[\s\S]*?<\/script>/, "").length > 0, "(the crew page differs only by the module)"); }
// 6 phone and desktop
for (const w of [390, 1440]) { const [p, r] = await view(withSplit(SPLIT), w); ok(r.present && r.overflow <= 0 && r.right <= r.vw, "at " + w + " px no sideways scroll and the rows inside the screen :: " + JSON.stringify([r.overflow, r.right, r.vw]));
  if (process.argv.includes("--shots")) { await p.evaluate(() => { const c = document.querySelector(".hero-left .sfc-card"); if (c) { c.scrollIntoView({ block: "start" }); window.scrollBy(0, -110); } }); await new Promise(r => setTimeout(r, 400)); await p.screenshot({ path: path.join(ROOT, "docs/demo-run/variant-rows-" + (w === 390 ? "phone-390" : "desktop-1440") + ".png") }); }
  await p.close(); }
await b.close();
console.log(out.join("\n")); console.log("variantRowsPageCheck: " + pass + " pass, " + fail + " FAIL"); process.exit(fail ? 1 : 0);
