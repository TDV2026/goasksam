// forSaleShowMoreCheck (Lane D, Nov 20 2026): Show more on the Dealers, Classifieds and All pills, crew only, on the LIVE handlers' real output in Chrome.
// CAUSE (Find "1965 Ford Mustang", Classifieds: 24 of 181 cards, no way to the rest): the engine already answered buySearch action "more" with forSaleGroup and forSaleOffset (lib/forsale/serve.js,
// api/buySearch.js) but the page (lib/forSalePage.js) never asked: a group drew its first batch and stopped, the auctions alone had a Show more button. EVERY OTHER PAGE: the Find page is the only one that draws the groups
// (Dealers, Classifieds and the two sections of All); Market Check and Tasks print counts only. This check stands the world of forSaleCheck up to 60 classifieds and 40 dealers for "1987 Porsche 911" (the same search the engine answers),
// puts a Greenland, NH classified with 999,999 miles past the first two pages, then reads the page: every card reachable, in the engine's order, none twice, the count line the engine's ("24 of N"), the button the engine's nextN.
//   node scripts/forSaleShowMoreCheck.mjs        MUTANTS (in a copy): node scripts/forSaleShowMoreCheck.mjs --mutants
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { pathToFileURL, fileURLToPath } from "node:url"; import { execFileSync } from "node:child_process";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); process.chdir(ROOT);
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) { fs.writeSync(1, "forSaleShowMoreCheck: SKIP no Chrome\n"); process.exit(0); }
if (process.argv.includes("--mutants")) {
  const MUT = [["the page never asks for more (no click handler)", "lib/forSalePage.js", 'e.preventDefault();var k=m.getAttribute("data-fs-more")', 'return;var k=m.getAttribute("data-fs-more")'],
    ["the ask starts at 0 again", "lib/forSalePage.js", "forSaleOffset:Number(g.shown)||0", "forSaleOffset:0"],
    ["the cards are not de-duplicated", "lib/forSalePage.js", "return !have[c.id]}", "return true}"],
    ["the button never goes when nothing remains", "lib/forSalePage.js", "rem=g&&Number(g.remaining)>0;", "rem=!!g;"],
    ["the count line is not drawn", "lib/forSalePage.js", "var cl=g&&g.countLine?", "var cl=false?"],
    ["the engine drops the count line", "lib/forsale/serve.js", 'countLine: list.length ? reasonLine("forsale.shown_of"', 'countLine: false ? reasonLine("forsale.count"'],
    ["the engine counts the batch twice", "lib/forsale/serve.js", "shown = more && more.group !== name ? 0 : Math.min(list.length, from + batch.length)", "shown = more && more.group !== name ? 0 : Math.min(list.length, from + batch.length + 1)"],
    ["the page asks the wrong group", "lib/forSalePage.js", "forSaleGroup:k,", 'forSaleGroup:"dealers",']];
  let bad = 0;
  for (const [name, file, from, to] of MUT) {
    const f = path.join(ROOT, file), src = fs.readFileSync(f, "utf8"); if (src.split(from).length !== 2) { bad++; fs.writeSync(1, "MISSED  " + name + " (target not found once)\n"); continue; }
    fs.writeFileSync(f, src.replace(from, () => to)); let caught = false;
    try { execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ROOT, stdio: "pipe", timeout: 600000 }); } catch { caught = true; } finally { fs.writeFileSync(f, src); }
    fs.writeSync(1, (caught ? "caught   " : "MISSED   ") + name + "\n"); if (!caught) bad++;
  }
  fs.writeSync(1, bad ? `forSaleShowMoreCheck mutants: ${bad} not caught\n` : `forSaleShowMoreCheck mutants: all ${MUT.length} caught\n`); process.exit(bad ? 1 : 0);
}
process.env.NEW_DESIGN = "1"; process.env.LAUNCH_STAGE = "2";
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href), say = s => fs.writeSync(1, s + "\n");
const W = await imp("scripts/_forSaleWorld.mjs");
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core"), BUYPAGE = (await imp("api/buy.js")).default;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; say("FAIL " + m); } };
// ---- Chrome ----
const IMG = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="100%" height="100%" fill="#b9c3cc"/></svg>';
async function openPage(b, url) {
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); p._err = []; p._asks = [];
  p.on("pageerror", e => p._err.push(String(e).slice(0, 200))); p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) p._err.push(m.text().slice(0, 200)); });
  await p.evaluateOnNewDocument("try{localStorage.removeItem('gas_fs_pill')}catch(e){}"); await p.setRequestInterception(true);
  p.on("request", async r => { try { const u = new URL(r.url()), m = r.method();
    if (u.host !== "goasksam.com") { if (r.resourceType() === "image") return r.respond({ status: 200, contentType: "image/svg+xml", body: IMG }); return r.respond({ status: 204, body: "" }); }
    if (u.pathname === "/api/buySearch" && m === "POST") { const body = JSON.parse(r.postData() || "{}"); p._asks.push(body); const o = await W.call(W.BUY, "/api/buySearch", { method: "POST", body, crew: true }); return r.respond({ status: o.code, contentType: o.h["content-type"] || "application/json", headers: { "access-control-allow-origin": "*" }, body: o.body }); }
    if (r.isNavigationRequest()) { const o = await W.call(BUYPAGE, u.pathname + u.search, { crew: true }); return r.respond({ status: o.code, contentType: o.h["content-type"] || "text/html", body: o.body }); }
    if (/^\/api\//.test(u.pathname) || u.pathname === "/find") return r.respond({ status: 200, contentType: "application/json", body: "{}" });
    return r.respond({ status: 404, body: "" }); } catch (e) { try { r.respond({ status: 500, body: String(e.message) }); } catch {} } });
  await p.goto("https://goasksam.com" + url, { waitUntil: "domcontentloaded" });
  try { await p.waitForSelector(".msg.results[data-done]", { timeout: 20000 }); } catch {}
  await new Promise(r => setTimeout(r, 1800)); return p;
}
// ---- the world, grown: 60 classifieds and 40 dealers for the same search, one of them the Greenland, NH classified with 999,999 miles ----
const T = W.TABLE, tpl = { classified: T.find(x => x.source_type === "classified"), dealer: T.find(x => x.source_type === "dealer") };
let nid = 9000; const add = (type, i, over = {}) => { const b = tpl[type], id = nid++; T.push({ ...JSON.parse(JSON.stringify(b)), id, source_listing_id: "M" + id, vendor_id: id, url: "https://www.example.test/inventory/" + id, image_url: "https://img.example/" + id + ".jpg", vin: "WP0AB0916HS" + String(200000 + id), vin_norm: "WP0AB0916HS" + String(200000 + id), asking_price_usd: 30000 + i * 700, mileage: 20000 + i * 900, ...over }); };
for (let i = 0; i < 60; i++) add("classified", i); for (let i = 0; i < 40; i++) add("dealer", i);
add("classified", 61, { location: "Greenland, NH", state: "NH", mileage: 999999, asking_price_usd: 29900 });
W.SERVE.forSaleReset();
const Q = "1987 Porsche 911", askMore = async (group, offset) => W.json(await W.call(W.BUY, "/api/buySearch", { method: "POST", body: { action: "more", filters: FILT, forSaleGroup: group, forSaleOffset: offset }, crew: true }));
const ENG0 = W.json(await W.find({ q: Q })); let FILT = null;
{ // the filters the page itself sends back on a Show more (its own state), read from one real press
  const b0 = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  try { const p0 = await openPage(b0, "/find?q=" + encodeURIComponent(Q)); await p0.evaluate(() => { document.querySelector('.fs-pill[data-fs-pill="classifieds"]').click(); const mb = document.querySelector('[data-fs-more="classifieds"]'); if (mb) mb.click(); }); await new Promise(r => setTimeout(r, 1500)); FILT = (p0._asks.find(a => a.action === "more") || {}).filters || null; await p0.close(); } finally { await b0.close(); } }
ok(!!FILT, "the page's own Show more sends the search's filters :: " + JSON.stringify(FILT));
const FS = ENG0.forSale;
ok(!!FS && FS.counts.classifieds >= 61 && FS.counts.dealers >= 40, "the engine's real answer holds the grown world :: " + JSON.stringify(FS && FS.counts));
ok(FS.classifieds.cards.length === 24 && FS.classifieds.shown === 24 && FS.classifieds.remaining === FS.counts.classifieds - 24 && FS.classifieds.countLine === `24 of ${FS.counts.classifieds}`, "the engine's first batch is 24 and its count line reads 24 of N :: " + FS.classifieds.countLine);
// the engine's whole order, by its own Show more road
const order = async (group, first) => { const ids = first.cards.map(c => c.id); let shown = first.shown, g = 0; while (shown < first.count && g++ < 50) { const r = (await askMore(group, shown)).forSale[group]; if (!r.cards.length) break; ids.push(...r.cards.map(c => c.id)); shown = r.shown; } return ids; };
const EC = await order("classifieds", FS.classifieds), ED = await order("dealers", FS.dealers);
ok(EC.length === FS.counts.classifieds && new Set(EC).size === EC.length, `the engine's own pages reach every classified, once each (${EC.length} of ${FS.counts.classifieds})`);
const greenId = "fs-" + T.find(x => x.location === "Greenland, NH").id;
ok(EC.indexOf(greenId) >= 48, "the Greenland, NH card sits past the second page in the engine's order, so only paging reaches it :: position " + EC.indexOf(greenId));
const READ = k => { const s = document.querySelector('.fs-sec[data-fs="' + k + '"]'); if (!s) return null; const t = e => e ? e.textContent.replace(/\s+/g, " ").trim() : null; const vis = e => !!e && !!(e.offsetWidth || e.offsetHeight);
  return { vis: vis(s), ids: [...s.querySelectorAll("article.car")].map(a => a.getAttribute("data-fs-id")), count: t(s.querySelector(".fs-count")), btn: t(s.querySelector("[data-fs-more]")), titles: [...s.querySelectorAll("article.car .ttl")].map(x => t(x)), meta: [...s.querySelectorAll("article.car .meta")].map(x => t(x)) }; };
const pageAll = async (p, k, total) => { let g = 0; while (g++ < 60) { const s = await p.evaluate(READ, k); if (!s.btn) return s; const before = s.ids.length; await p.evaluate(kk => { const a = document.querySelector('.fs-sec[data-fs="' + kk + '"] [data-fs-more]'); if (a) a.click(); }, k);
  for (let w = 0; w < 100; w++) { await new Promise(r => setTimeout(r, 80)); const n = (await p.evaluate(READ, k)).ids.length; if (n !== before) break; } if ((await p.evaluate(READ, k)).ids.length === before) break; } return await p.evaluate(READ, k); };   // a press that draws nothing ends the paging (the asserts then fail)
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] }), fmt = n => Number(n).toLocaleString("en-US");
try {
  // CLASSIFIEDS
  let p = await openPage(browser, "/find?q=" + encodeURIComponent(Q)); await p.evaluate(() => document.querySelector('.fs-pill[data-fs-pill="classifieds"]').click());
  let s = await p.evaluate(READ, "classifieds");
  ok(s && s.ids.length === 24 && s.count === `24 of ${fmt(FS.counts.classifieds)}` && s.btn === "Show 24 more", "Classifieds opens on 24 cards, the line reads 24 of N and the button Show 24 more :: " + JSON.stringify(s && [s.ids.length, s.count, s.btn]));
  s = await pageAll(p, "classifieds");
  ok(s.ids.length === EC.length && new Set(s.ids).size === s.ids.length, `Classifieds: every card reachable, none twice (${s.ids.length} of ${EC.length}, ${new Set(s.ids).size} distinct)`);
  ok(s.ids.join() === EC.join(), "Classifieds: the cards are in the engine's order, page after page");
  ok(s.ids.includes(greenId) && s.titles.length && s.meta[s.ids.indexOf(greenId)] === "Greenland, NH", "the Greenland, NH card is among them, with no miles line (999,999 is no stated mileage) :: " + (s.meta[s.ids.indexOf(greenId)]));
  ok(s.count === `${fmt(EC.length)} of ${fmt(EC.length)}` && !s.btn, "at the end the line reads N of N and the button is gone :: " + s.count + " / " + s.btn);
  ok(p._asks.filter(a => a.action === "more").every(a => a.forSaleGroup === "classifieds" && a.filters && Number.isInteger(a.forSaleOffset)) && p._asks.filter(a => a.action === "more").map(a => a.forSaleOffset).join() === [24, 48].concat(Array.from({ length: Math.ceil((EC.length - 72) / 24) }, (_, i) => 72 + i * 24)).slice(0, p._asks.filter(a => a.action === "more").length).join(), "each ask names the group and the engine's own shown count as the offset :: " + p._asks.filter(a => a.action === "more").map(a => a.forSaleOffset).join());
  ok(p._err.length === 0, "no page error :: " + p._err.join("|")); await p.close();
  // DEALERS
  p = await openPage(browser, "/find?q=" + encodeURIComponent(Q)); await p.evaluate(() => document.querySelector('.fs-pill[data-fs-pill="dealers"]').click());
  s = await pageAll(p, "dealers");
  ok(s.ids.length === ED.length && new Set(s.ids).size === ED.length && s.ids.join() === ED.join(), `Dealers: every card reachable, once each, in the engine's order (${s.ids.length} of ${ED.length})`);
  ok(s.count === `${fmt(ED.length)} of ${fmt(ED.length)}` && !s.btn, "Dealers ends on N of N with no button"); ok(p._err.length === 0, "no page error on Dealers :: " + p._err.join("|")); await p.close();
  // ALL: both groups, each with its own line and button
  p = await openPage(browser, "/find?q=" + encodeURIComponent(Q)); await p.evaluate(() => document.querySelector('.fs-pill[data-fs-pill="all"]').click());
  const a0 = await p.evaluate(READ, "classifieds"), d0 = await p.evaluate(READ, "dealers");
  ok(a0.vis && d0.vis && a0.count === `24 of ${fmt(FS.counts.classifieds)}` && d0.count === `24 of ${fmt(FS.counts.dealers)}`, "All shows both groups, each with its own count line :: " + a0.count + " / " + d0.count);
  const ac = await pageAll(p, "classifieds"), ad = await pageAll(p, "dealers");
  ok(ac.ids.join() === EC.join() && ad.ids.join() === ED.join(), "All: both groups page through to the engine's whole order, no card twice"); ok(p._err.length === 0, "no page error on All :: " + p._err.join("|")); await p.close();
  // a failed ask leaves the button and says so
  p = await openPage(browser, "/find?q=" + encodeURIComponent(Q)); await p.evaluate(() => document.querySelector('.fs-pill[data-fs-pill="classifieds"]').click());
  await p.evaluate(() => { const o = window.fetch; window.fetch = function (u, i) { if (i && i.body && /"more"/.test(i.body)) return Promise.reject(new Error("x")); return o.apply(this, arguments); }; const mb = document.querySelector('[data-fs-more="classifieds"]'); if (mb) mb.click(); });
  await new Promise(r => setTimeout(r, 600)); const f = await p.evaluate(() => ({ note: (document.querySelector(".fs-foot .morenote") || {}).textContent || null, btn: (document.querySelector('[data-fs-more="classifieds"]') || {}).textContent || null }));
  ok(f.note && /Could not load more/.test(f.note) && f.btn === "Show 24 more", "a failed ask keeps the button and says so :: " + JSON.stringify(f)); await p.close();
  // a batch that repeats a card already drawn (an engine page that overlaps) never draws it twice
  p = await openPage(browser, "/find?q=" + encodeURIComponent(Q)); await p.evaluate(() => document.querySelector('.fs-pill[data-fs-pill="classifieds"]').click());
  await p.evaluate(() => { const o = window.fetch; window.fetch = function (u, i) { const r = o.apply(this, arguments); if (!(i && i.body && /"more"/.test(i.body))) return r; return r.then(x => x.json()).then(j => { const first = document.querySelector('.fs-sec[data-fs="classifieds"]').__x; const b = document.querySelector(".msg.results").__d.forSale.classifieds.cards[0]; j.forSale.classifieds.cards.unshift(JSON.parse(JSON.stringify(b))); return new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } }); }); }; document.querySelector('[data-fs-more="classifieds"]').click(); });
  await new Promise(r => setTimeout(r, 1200)); const dd = await p.evaluate(READ, "classifieds");
  ok(dd.ids.length === 48 && new Set(dd.ids).size === 48, "a batch that repeats a card already drawn adds only the new ones (48 distinct) :: " + dd.ids.length + " / " + new Set(dd.ids).size); await p.close();
  // a visitor's page carries none of it (the groups are crew only)
  const vp = await (async () => { const o = await W.call(BUYPAGE, "/find?q=" + encodeURIComponent(Q), { crew: false }); return o.body; })();
  ok(!/data-fs-more|fs-foot|forSaleOffset|fs-count/.test(vp), "a visitor's page carries nothing of Show more");
  // the zip keys the page sends back are the ones the page itself keeps
  const SRC = (await imp("api/buy.js")).BUY_CLIENT_SOURCE; ok(SRC.includes('sessionStorage.getItem("gas_buy_zip")') && SRC.includes('sessionStorage.getItem("gas_buy_radius")'), "the zip and radius keys Show more sends are the page's own");
} finally { await browser.close(); }
say(`forSaleShowMoreCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
