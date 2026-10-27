// GOASKSAM 2.0 STAGE 2, THE FOUR START PAGES (Sam's block and reference images, Oct 23 2026; Lane C): Home, Find, Market Check and the new
// Sell each draw ONE shared start component (lib/startPage.js) with Sam's own words; each box keeps its page's own ids (so each page's
// engine path is untouched); Home submits to /find?q= (populated results, never the empty Find page); Home is closed (to /sell, 302)
// until Find is released; nothing says "collector"; no first-person Sam beyond Sam's own ordered placeholder; no Daily Vroom section in
// Home's body; the dated lead sentence search rule 1 asks for is on every page. No network.   node scripts/startPagesCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
process.env.LAUNCH_STAGE = "2";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
process.chdir(ROOT);
const call = async (mod, url, headers = {}) => { const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", mod + ".js")).href);
  return await new Promise(resolve => { const hd = {}; const res = { setHeader(k, v) { hd[k.toLowerCase()] = v; }, getHeader() {}, status(c) { res.code = c; return res; }, send(b) { resolve({ code: res.code || 200, body: String(b), hd }); return res; }, end(b) { resolve({ code: res.code || 200, body: String(b || ""), hd }); return res; }, json(o) { resolve({ code: res.code || 200, body: JSON.stringify(o), hd }); return res; } };
    Promise.resolve(h({ method: "GET", url, query: {}, headers: { host: "goasksam.com", cookie: "", ...headers }, socket: {} }, res)).catch(e => resolve({ code: 500, body: String(e), hd })); setTimeout(() => resolve({ code: 504, body: "", hd }), 25000); }); };
const text = h => h.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&middot;|&#183;/g, "·").replace(/\s+/g, " ");
const home = await call("home", "/"), find = await call("buy", "/find"), mc = await call("marketCheck", "/market-check"), sell = await call("sellNext", "/api/sellNext", { cookie: "" });
// Home
ok(home.code === 200 && /<h1 class="gst-h">Find the car you&#39;re looking for\.<\/h1>/.test(home.body) || /<h1 class="gst-h">Find the car you're looking for\.<\/h1>/.test(home.body), "Home: the headline is Sam's (" + home.code + ")");
const homeMarkup = home.body.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
ok(!/Welcome to GoAskSam/i.test(homeMarkup) && !/class="gst-eye"/.test(homeMarkup) && /Tell Sam what you want\. Search live enthusiast car auctions in your own words\./.test(home.body) && !/Speak or type naturally/.test(home.body), "Home: no eyebrow, no helper line, the sub is Sam's");
ok(/Market Check<\/b><span>See what similar cars have actually sold for\.<\/span>/.test(home.body) && /Sell a car<\/b><span>Discover where and how to sell\.<\/span>/.test(home.body), "Home: the two cards are Sam's");
// (Oct 25 2026: the one quiet bottom line "(c) GoAskSam, from The Daily Vroom" with Privacy links is Sam's order and is the only mention allowed in the body.)
const homeMain = home.body.slice(home.body.indexOf("<main"), home.body.indexOf("</main>")).replace(/<div class="hm-legal">[\s\S]*?<\/div>/, "");
ok(!/Daily Vroom/.test(text(homeMain)), "Home: no Daily Vroom section in the body (it stays in the rail)");
ok(/<div class="hm-legal"><span>&copy; GoAskSam, from The Daily Vroom<\/span><a href="\/terms">Terms<\/a><a href="\/privacy">Privacy<\/a><a [^>]*>Privacy choices<\/a><\/div>/.test(home.body), "Home: one quiet bottom line with the copyright and the Privacy and Privacy choices links");
ok(/location\.href="\/find\?q="\+encodeURIComponent\(v\)/.test(home.body), "Home: submit goes straight to /find?q= (populated results)");
ok(/data-gst-enter/.test(home.body) && /data-ph="/.test(home.body), "Home: Enter submits and the examples rotate");
ok(/<p class="gst-asof" data-lead-sentence>Live auctions and completed sales/.test(home.body), "Home: the dated lead sentence (rule 1)");
const closed = await call("home", "/", { cookie: "" });
{ const prev = process.env.LAUNCH_STAGE; process.env.LAUNCH_STAGE = "0"; const c0 = await call("home", "/"); process.env.LAUNCH_STAGE = prev; ok(c0.code === 302 && c0.hd.location === "/sell", "Home: while Find is not released, '/' answers as before (302 to /sell), not a permanent redirect"); }
// Find
ok(/<h1 class="gst-h">What car are you looking for\?<\/h1>/.test(find.body) && /Find · Live auctions/.test(find.body) && /Describe it naturally\. Sam searches live enthusiast car auctions for you\./.test(find.body), "Find: eyebrow, headline, sub are Sam's");
ok(!/Type it or say it/.test(find.body) && !/Live auctions across platforms/.test(find.body) && /id="hq"/.test(find.body) && /id="hgo"/.test(find.body) && /id="hmic"/.test(find.body), "Find: helper and line are Sam's; the box keeps ids hq, hgo, hmic (its own engine path)");
ok(/data-lead-sentence>Live auctions( \u00b7 Updated [A-Z][a-z]{2} \d{1,2}, \d{4})?</.test(find.body) && /<meta name="description" content="Live auctions( as of [A-Z][a-z]+ \d{1,2}, \d{4})?, each one shown with what cars like it have actually sold for\.">/.test(find.body) && !/Sam follows the enthusiast/.test(find.body) && !/collector/i.test(text(find.body)), "Find: the dated lead sentence is there and nothing says collector");
ok(!/lk-chip|Put Sam on it|ls-step|One search\. Every live/.test(find.body.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script>[\s\S]*?<\/script>/g, "")), "Find: the old landing (hero, feature cards, Put Sam on it, example band) is gone");
// Market Check
ok(/<h1 class="gst-h">What have cars like yours sold for\?<\/h1>/.test(mc.body) && /Market Check · Completed sales/.test(mc.body) && /See what cars like yours actually sold for\./.test(mc.body), "Market Check: eyebrow, headline, sub are Sam's");
ok(/1995 Porsche 911 Carrera/.test(mc.body) && !/Describe the car, enter a VIN, or use your voice/.test(mc.body) && /Completed sales only\. Every result links to its source\./.test(mc.body) && /id="ob-input"/.test(mc.body) && /id="ob-go"/.test(mc.body), "Market Check: placeholder, helper and line are Sam's; the box keeps ob-input and ob-go");
ok(/data-lead-sentence>Completed sales( \u00b7 Updated [A-Z][a-z]{2} \d{1,2}, \d{4})?</.test(mc.body) && !/collector/i.test(text(mc.body.slice(mc.body.indexOf('id="mc-landing"'), mc.body.indexOf("</main>")))), "Market Check: the dated lead is there and the start page says nothing about collector");
// Sell
ok(/<h1 class="gst-h">Where should you sell your car\?<\/h1>/.test(sell.body) || sell.code !== 200 || /SELL_NEXT/.test(sell.body), "Sell (new): the headline is Sam's (or the page is switched off)");
if (sell.code === 200) ok(/Tell Sam what you&#39;re selling|Tell Sam what you're selling/.test(sell.body) && /2004 Porsche 911 Carrera/.test(sell.body) && /Auction data/.test(sell.body) && !/Real completed sales\. Evidence behind the recommendations/.test(sell.body) && /Platform performance · Selling strategy · PowerSeller matching/.test(sell.body) && /id="ob-input"/.test(sell.body), "Sell (new): sub, placeholder and line are Sam's; the box keeps ob-input and ob-go");
// the palette bar is for the crew cookie only: none of its markup, stylesheet or script reaches a visitor without it
for (const [n, b] of [["Home", home.body], ["Find", find.body], ["Market Check", mc.body]]) ok(!/class="gas-pal-bar"|data-pal-btn|class="gas-pal-lbl"|\.gas-pal-bar\{/.test(b), n + ": no palette bar in a public page's HTML");
// GoAskSam 2.0 Stage 4: server-rendered, own titles and descriptions, structured data
const ttl = h => (/<title>([^<]*)<\/title>/.exec(h) || [])[1] || "", dsc = h => (/<meta name="description" content="([^"]*)"/.exec(h) || [])[1] || "";
const metas = [["Home", home.body], ["Find", find.body], ["Market Check", mc.body]];
ok(metas.every(([, b]) => ttl(b).length > 12 && dsc(b).length > 40), "each public start page has its own title and description in the first HTML");
ok(new Set(metas.map(([, b]) => ttl(b))).size === 3 && new Set(metas.map(([, b]) => dsc(b))).size === 3, "no two start pages share a title or a description");
ok(!/collector/i.test(metas.map(([, b]) => ttl(b) + " " + dsc(b)).join(" ")), "no title or description says collector");
const ld = (/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(home.body) || [])[1];
let ldj = null; try { ldj = JSON.parse(ld); } catch {}
const g = ldj && ldj["@graph"] || [];
ok(g.some(x => x["@type"] === "Organization" && x.name === "GoAskSam" && !x.founder && x.parentOrganization && x.parentOrganization.name === "The Daily Vroom" && !/Sam Gold/.test(JSON.stringify(x))) && g.some(x => x["@type"] === "WebSite" && x.potentialAction && x.potentialAction["@type"] === "SearchAction" && x.potentialAction.target.urlTemplate === "https://goasksam.com/find?q={search_term_string}" && x.potentialAction["query-input"] === "required name=search_term_string"), "Home carries Organization and WebSite structured data with the site search action pointing at /find");
if (sell.code === 200) ok(/<main class="wrap"><div id="ob"><div id="sell-landing"/.test(sell.body) && /<h1 class="gst-h">Where should you sell your car\?<\/h1>/.test(sell.body), "Sell (new): the start page is in the first HTML, not drawn afterwards by the browser");
for (const [n, b] of [["Home", home.body], ["Find", find.body], ["Market Check", mc.body]]) ok(/<h1 class="gst-h">/.test(b) && /class="gst-sub"/.test(b) && /class="gst-in"/.test(b) && /data-lead-sentence/.test(b), n + ": headline, sub, box and dated lead are all in the first HTML");
// shared
const sp = fs.readFileSync(path.join(ROOT, "lib/startPage.js"), "utf8");
ok(/startHtml\.toString\(\)/.test(sp) && /class="gst-mic"/.test(sp) && /class="gst-go"/.test(sp) && /<textarea/.test(sp), "one component: the server and the browser draw it with the same function; the same mic and submit on all four");
ok(/SR = window\.SpeechRecognition \|\| window\.webkitSpeechRecognition/.test(sp) && /mic\.hidden = true/.test(sp), "the mic shows only where the browser can listen");
const oldSell = fs.readFileSync(path.join(ROOT, "api/sellPage.js"), "utf8");
ok(/railOpenHtml\(\{ active: "sell", pageExtra: saved/.test(oldSell), "the old Sell page gets only the shared rail");
const vj = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
ok(!vj.redirects.some(r => r.source === "/") && vj.rewrites.filter(r => r.source === "/").length === 2 && !fs.existsSync(path.join(ROOT, "public/index.html")), "/ is served by the Home page (no redirect, and no static index.html to shadow it)");
ok(vj.redirects.some(r => r.source === "/sell-old.html" && r.destination === "/sell"), "the old Sell page's file is not a second public page");
console.log(`startPagesCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
