// THE HOME AND FIND PREVIEWS, FINAL CORRECTIONS (Lane E, Nov 5 2026; lib/preview/previewPages.js, crew only, never live). What it proves, and that each part FAILS when its fix is taken away:
//   1 COPY AND STRUCTURE: the nav, the placeholder, the three pills, the three columns, the five column How Sam decides (Sam's words, as given), the shared header, search, pills and footer on both pages, the Find rail (Recent searches only for a signed in visitor, no suggestions
//     standing in for history, 250 to 260 wide, New search 42 to 44 tall) and the visually removed Find heading (still a heading for a screen reader).
//   2 LAYOUT at 1440, 1024, 768 and 390: no horizontal scroll, no clipped text, the search icon, text, mic and arrow on one centre line, the placeholder fits, the pills on one line on a desktop, the Porsche never over the search, pills or rail.
//   3 THE FEATURED HISTORY: the gate hides the whole section for anything short of a complete, honest engine field (a ladder of mutants), the photo of the current auction dominates and the earlier one is small beside its details, a listing is never called a sale.
//   4 CREW ONLY, NEVER PUBLIC: the previews answer a stranger with the platform's own 404; the featured history section and its field appear in no live page, public route, sitemap or public source. Mutants: a gate removed, the section wired into a live page, the field in a public file.
//   node scripts/homeFindPreviewCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
process.env.CURTAIN_CREW_CODE = "fixture-crew-code"; process.env.LAUNCH_STAGE = "2"; process.env.SELL_NEXT_ON = "1"; for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) delete process.env[k];
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
const { homeHtml, findHtml, rulesOf, featuredHistoryOf, featuredHistoryHtml } = await imp("lib/preview/previewPages.js");
const { soldFixture, listedFixture, NOW } = await imp("scripts/featuredHistoryFixture.mjs"), { MEASURE } = await imp("scripts/homeFindMeasure.mjs");
const { PLACEHOLDERS } = await imp("lib/startPlaceholders.js"), { mintCrewCookieValue } = await imp("lib/_crew.js"), crewPage = (await imp("api/crewPage.js")).default;
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
const decode = t => t.replace(/&middot;/g, "·").replace(/&rarr;/g, "→").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#8599;/g, "↗");
const textOf = html => decode(html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ");
const HOME = homeHtml(), FIND = findHtml(), HIST = homeHtml({ featuredHistory: soldFixture(), allowData: true, now: NOW });

// ---------- 1 copy and structure ----------
const nav = h => [...(h.match(/<nav class="tabs"[\s\S]*?<\/nav>/) || [""])[0].matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map(m => m[1]);
for (const [n, h] of [["home", HOME], ["find", FIND]]) {
  ok(JSON.stringify(nav(h)) === JSON.stringify(["Find", "Market Check", "Sell", "Tasks", "Account"]), `${n}: the nav is Find, Market Check, Sell, Tasks, Account (${nav(h).join(" | ")})`);
  ok(/class="acct"/.test(h) && /\.tabs a\.acct\{[^}]*border:1px solid/.test(h) && !/\.tabs a\.acct\{[^}]*background:(?!none)/.test(h), `${n}: Account is the understated outlined button, not solid`);
  ok(!/Find\s*(?:&middot;|·)\s*Check|Find, check, sell/i.test(textOf(h)), `${n}: no Find Check Sell tagline`);
  ok(/<span class="beta">Beta<\/span>/.test(h), `${n}: the small Beta badge sits beside the wordmark`);
  ok(h.includes('placeholder="Tell Sam what you&#39;re looking for..."') && !/>\s*Go ask Sam\s*</.test((h.match(/<form class="sb"[\s\S]*?<\/form>/) || [""])[0].replace(/aria-label="[^"]*"/g, "")), `${n}: the placeholder is exact and the submit is the arrow, no text button`);
  const pl = [...h.matchAll(/<a class="pill" href="\/find\?q=([^"]*)">([^<]*)<\/a>/g)].map(m => decode(m[2]));
  ok(JSON.stringify(pl) === JSON.stringify(["Manual 911 under $40k", "Red Ferrari under 10k miles", "Corvette near Chicago"]) && pl.every((t, i) => t === PLACEHOLDERS.preview.examples[i]), `${n}: the three pills, in Sam's order, each a link that starts the search (${pl.join(" | ")})`);
}
{ const parts = h => ["header", "form class=\"sb\"", "div class=\"pills\"", "footer"].map(t => (h.match(new RegExp("<" + t.replace(/"/g, '"') + "[\\s\\S]*?</" + t.split(" ")[0] + ">")) || [""])[0].replace(/ aria-current="page"/, ""));
  const a = parts(HOME), b = parts(FIND); ok(a.every((x, i) => x && x === b[i]), "home and Find carry the same header, search, pills and footer, byte for byte"); }
{ const t = textOf(HOME); for (const w of ["Find live auctions across multiple platforms.", "Explore comparable sales with real evidence.", "Discover where and how to sell your car.", "One search. Multiple auction platforms.", "Find your next car. See real sales. Discover where to sell."]) ok(t.includes(w), `home prints exactly: ${w}`);
  const ways = [...HOME.matchAll(/<a class="way" href="([^"]*)">/g)].map(m => m[1]); ok(JSON.stringify(ways) === JSON.stringify(["/find", "/market-check", "/sell"]) && !/class="way"[^>]*>[\s\S]{0,400}<button/.test(HOME), "the three columns are whole links with no promo button"); }
{ const R = rulesOf(), want = ["Completed sales only|We use actual selling prices, not dealer asking prices or unsuccessful bids.", "Like with like|We look for relevant models, specifications and mileage, not just matching badges.", "No invented answers|When evidence is limited, we make that clear rather than pretending to know more.", "Evidence you can inspect|See how many sales support the result and explore the transactions behind it."];
  const t = textOf(HOME); ok(R.lead === "Every range starts with real completed sales of comparable cars." && R.rules.map(r => r.h + "|" + r.b).join("\n") === want.join("\n") && /How Sam decides/.test(t) && want.every(w => w.split("|").every(x => t.includes(x))) && (HOME.match(/<div class="rule">/g) || []).length === 4, "How Sam decides prints Sam's intro and four principles word for word, five columns"); }
ok(!/Searches to try/.test(FIND) && !/class="it"/.test(FIND), "Find rail: no suggested searches stand in the rail (the same three are under the search bar)");
ok(/<h1 class="sr">Find<\/h1>/.test(FIND) && !/class="t-title"/.test(FIND), "Find: the Find heading and its lead are for a screen reader only (a semantic h1 stays)");
ok(/Let Sam keep watch for you\./.test(FIND) && /href="\/tasks"/.test(FIND), "Find rail: Tasks stays, with a one line explanation");
{ const dash = /[–—]|\w-\w(?!\w*\s*\()|\s-\s/; const t = textOf(HOME) + " " + textOf(FIND); const m = t.replace(/under \$40k|10k|911|Daily Vroom|What's new/g, "").match(/[–—]|\s-\s/); ok(!m, "no dash in the copy of either page" + (m ? " (" + m[0] + ")" : "")); }

// ---------- the browser ----------
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
async function load(html, width, pre) { const p = await b.newPage(); await p.setViewport({ width, height: 900 }); if (pre) await p.evaluateOnNewDocument(pre); await p.setRequestInterception(true); p.on("request", r => r.isNavigationRequest() ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.respond({ status: 204, body: "" })); await p.goto("https://goasksam.com/x", { waitUntil: "networkidle2" }).catch(() => {}); await new Promise(r => setTimeout(r, 250)); return p; }
async function layoutBad(htmls, widths) {
  const bad = [];
  for (const [name, html] of htmls) for (const w of widths) { const p = await load(html, w), m = await p.evaluate(MEASURE); await p.close();
    if (m.hscroll) bad.push(`${name} @${w}: horizontal scroll`); if (m.clipped.length) bad.push(`${name} @${w}: clipped text ${m.clipped[0]}`);
    if (m.searchMid && new Set(m.searchMid.filter(x => x != null)).size !== 1) bad.push(`${name} @${w}: search icon, text, mic and arrow are not on one centre line (${m.searchMid})`);
    if (m.placeholderFits === false) bad.push(`${name} @${w}: the placeholder is clipped`);
    if (m.pillRows != null && w >= 1024 && m.pillRows !== 1) bad.push(`${name} @${w}: the pills wrap (${m.pillRows} rows)`);
    if (m.decoOverlap) bad.push(`${name} @${w}: the Porsche is over the search, a pill or the rail`);
    if (m.heroLefts && new Set(m.heroLefts).size !== 1) bad.push(`${name} @${w}: the hero headline, line, search and pills do not share one left edge (${m.heroLefts})`);
    if (m.footerLeft != null && m.headerLeft != null && m.footerLeft !== m.headerLeft) bad.push(`${name} @${w}: the footer wordmark is not on the header's gutter`);
    if (m.wayW && w > 860 && new Set(m.wayW).size !== 1) bad.push(`${name} @${w}: the three columns are not equal (${m.wayW})`);
    if (m.wayH2Top && w > 860 && new Set(m.wayH2Top).size !== 1) bad.push(`${name} @${w}: the column headings are not on one baseline (${m.wayH2Top})`);
    if (m.photoBig && !(m.photoBig > m.photoSmall * 4)) bad.push(`${name} @${w}: the two photos are too close in size (${m.photoBig} v ${m.photoSmall})`);
    if (m.photoBig && !m.smallBesideDetails) bad.push(`${name} @${w}: the small earlier photo is not beside the history details`); }
  return bad;
}
const W = [1440, 1024, 768, 390];
const bad2 = await layoutBad([["home", HOME], ["home with history", HIST], ["find", FIND]], W); ok(bad2.length === 0, `2 layout at ${W.join(", ")}: ${bad2.slice(0, 4).join("; ") || "ok"}`);
{ const bad = await layoutBad([["home", HOME.replace("</style>", ".sb .mic{margin-top:6px}</style>")]], [1440]); ok(bad.length > 0, `2 mutant: a mic off the search's centre line is caught (${bad[0] || "NOT CAUGHT"})`);
  const bad3 = await layoutBad([["find", FIND.replace("</style>", ".deco{position:absolute;left:40%;top:30%;width:600px;height:300px}.main{position:relative}</style>")]], [1440]); ok(bad3.length > 0, `2 mutant: a Porsche over the search is caught (${bad3[0] || "NOT CAUGHT"})`);
  const bad4 = await layoutBad([["home", HOME.replace("</style>", ".way:nth-child(2){padding-top:40px}</style>")]], [1440]); ok(bad4.length > 0, `2 mutant: a column heading off the shared baseline is caught (${bad4[0] || "NOT CAUGHT"})`); }
// the Find rail and heading, in the page
{ const p = await load(FIND, 1440), m = await p.evaluate(() => { const r = e => e.getBoundingClientRect(), rail = document.querySelector(".rail"), nw = document.querySelector(".new"), h = document.querySelector("h1.sr"), q = document.querySelector(".stage h2"), main = document.querySelector(".main"); const mr = r(main), qr = r(q);
    return { rail: Math.round(r(rail).width), newH: Math.round(r(nw).height), h1: h ? { w: r(h).width, h: r(h).height } : null, centred: Math.round(Math.abs((qr.left + qr.right) / 2 - (mr.left + mr.right) / 2)), headHidden: document.getElementById("rail-head").hidden, listLen: document.getElementById("rail-recent").children.length }; });
  ok(m.rail >= 250 && m.rail <= 260 && m.newH >= 42 && m.newH <= 44, `Find: the rail is ${m.rail}px and New search ${m.newH}px tall`); ok(m.h1 && m.h1.w <= 2 && m.h1.h <= 2, "Find: the Find heading is visually removed and still in the page"); ok(m.centred <= 2, `Find: the question is centred in the content area (off by ${m.centred}px)`);
  ok(m.headHidden && m.listLen === 0, "Find rail: a visitor with no signed in history sees no Recent searches and no list"); await p.close(); }
{ const sess = `try{localStorage.setItem("gas_auth_session",JSON.stringify({access_token:"t"}));sessionStorage.setItem("gas_recent_s",JSON.stringify([{label:"A recent search with a very long label that has to be cut off with an ellipsis at the end",url:"/find?q=a"},{label:"Second search",url:"/find?q=b"}]));}catch(e){}`;
  const p = await load(FIND, 1440, sess), m = await p.evaluate(() => ({ head: document.getElementById("rail-head").textContent, hidden: document.getElementById("rail-head").hidden, rows: [...document.querySelectorAll("#rail-recent .it")].map(a => ({ h: Math.round(a.getBoundingClientRect().height), ell: getComputedStyle(a.querySelector("span")).textOverflow })) }));
  ok(!m.hidden && m.head === "Recent searches" && m.rows.length === 2 && new Set(m.rows.map(x => x.h)).size === 1 && m.rows.every(x => x.ell === "ellipsis"), "Find rail: a signed in visitor's own history is listed as Recent searches, equal rows, long labels cut with an ellipsis"); await p.close();
  const p2 = await load(FIND, 1440, sess.replace('localStorage.setItem("gas_auth_session",JSON.stringify({access_token:"t"}));', 'localStorage.removeItem("gas_auth_session");')), m2 = await p2.evaluate(() => document.getElementById("rail-recent").children.length); ok(m2 === 0, "Find rail: history saved in the browser is not shown to a visitor who is not signed in"); await p2.close(); }

// ---------- 3 the featured history ----------
const NOWOPT = { now: NOW, allowData: true };
ok(!!featuredHistoryOf(soldFixture(), NOWOPT) && !!featuredHistoryOf(listedFixture(), NOWOPT), "3 the gate passes a complete sold field and a complete listed field");
{ const T = textOf(HIST); ok(/This car has sold before\. Would you have known\?/.test(T) && /Sold for \$116,000/.test(T) && /View this auction/.test(T) && /See this car's history/.test(T) && /May 2022 · Sample Platform/.test(T) && /25,000 miles/.test(T) && /4,000 more miles/.test(T), "3 the sold layout prints the engine's headline, month and year, platform, mileage then and now, the difference, the price, the two links");
  const LH = homeHtml({ featuredHistory: listedFixture(), allowData: true, now: NOW }), L = textOf((LH.match(/<section class="fh[\s\S]*?<\/section>/) || [""])[0]); ok(/This car has been listed before\. Would you have known\?/.test(L) && /No completed sale confirmed/.test(L) && !/Sold for|\$\d/.test(L) && !/\bsold\b/i.test(L), "3 the listed layout shows no price, no sale wording and 'No completed sale confirmed' (" + L.slice(0, 160) + ")");
  ok(/href="\/find\?q=[^"]*history=1"/.test(HIST) && (HIST.match(/target="_blank" rel="noopener"/g) || []).length >= 3, "3 the history link opens the Find result inside the site and the auction links leave it safely"); }
const mut = (f, k, v) => { const o = JSON.parse(JSON.stringify(f())); const set = (t, ks, val) => { const [h, ...r] = ks; if (!r.length) { if (val === undefined) delete t[h]; else t[h] = val; } else set(t[h], r, val); }; set(o, k.split("."), v); return o; };
const LADDER = [["a missing field", () => undefined, null], ["null", () => null, null], ["kind not sold or listed", () => mut(soldFixture, "kind", "auction"), null], ["a missing headline", () => mut(soldFixture, "headline", ""), null], ["a sold field whose headline says listed", () => mut(soldFixture, "headline", "This car has been listed before. Would you have known?"), null],
  ["a listed field that calls itself sold", () => mut(listedFixture, "headline", "This car has sold before. Would you have known?"), null], ["a listed field that carries a price", () => mut(listedFixture, "previous.price", 90000), null], ["a sold field with no price", () => mut(soldFixture, "previous.price", undefined), null], ["an expired auction", () => mut(soldFixture, "current.endsAt", "2026-11-01T00:00:00Z"), null],
  ["a current auction not marked live", () => mut(soldFixture, "current.live", false), null], ["no photo of the current car", () => mut(soldFixture, "current.photo", ""), null], ["an http photo", () => mut(soldFixture, "current.photo", "http://x.test/p.jpg"), null], ["no earlier photo", () => mut(soldFixture, "previous.photo", ""), null], ["no earlier listing link", () => mut(soldFixture, "previous.url", ""), null],
  ["no month and year", () => mut(soldFixture, "previous.date", "earlier"), null], ["valuation language in the take", () => mut(soldFixture, "take", "A bargain, worth more now."), null], ["no checkedAt", () => mut(soldFixture, "checkedAt", undefined), null], ["a Find link that leaves the site", () => mut(soldFixture, "findUrl", "https://evil.test/find"), null], ["a javascript link", () => mut(soldFixture, "current.url", "javascript:alert(1)"), null]];
for (const [name, f] of LADDER) { const h = homeHtml({ featuredHistory: f(), allowData: true, now: NOW }); ok(!/data-featured-history|class="fh/.test(h) && /How Sam decides/.test(h), `3 the whole section is hidden for ${name}`); }
// without the gate: a page that prints whatever field it is given shows the expired auction and the listing called a sale
{ const ungated = fh => { const g = featuredHistoryOf; return fh; }; const expired = mut(soldFixture, "current.endsAt", "2026-11-01T00:00:00Z"); ok(featuredHistoryOf(expired, NOWOPT) === null && ungated(expired) !== null, "3 a gate that did not check endsAt would pass the expired auction (the ladder row above is what stops it)"); }

// ---------- 4 crew only, never public ----------
const crew = "gas_crew=" + mintCrewCookieValue();
async function call(handler, url, cookie) { const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, status(c) { this.code = c; return this; }, send(x) { this.body = String(x); return this; }, end(x) { this.body = String(x || ""); return this; }, json(o) { this.body = JSON.stringify(o); return this; } };
  const u = new URL("https://goasksam.com" + url); await Promise.race([handler({ url, method: "GET", query: Object.fromEntries(u.searchParams), body: {}, headers: { host: "goasksam.com", "user-agent": "Mozilla/5.0", accept: "text/html", ...(cookie ? { cookie } : {}) } }, res), new Promise((_, r) => setTimeout(() => r(new Error("timed out")), 20000))]); return res; }
async function gateBad(handler) { const bad = []; for (const pg of ["preview-home", "preview-find"]) {
  for (const [label, c] of [["no cookie", null], ["a forged cookie", "gas_crew=v1.9999999999999.forged"]]) { const r = await call(handler, "/api/crewPage?page=" + pg, c); if (r.code !== 404 || /GoAskSam|How Sam decides|Tell Sam/.test(r.body)) bad.push(`${pg} answered ${label} with ${r.code}`); }
  const g = await call(handler, "/api/crewPage?page=" + pg, crew); if (g.code !== 200 || !/noindex/.test(g.h["x-robots-tag"] || "") || !/<meta name="robots" content="noindex, nofollow">/.test(g.body)) bad.push(`${pg} with the crew cookie: ${g.code}, not noindex`);
  if (/data-featured-history|featuredHistory|class="fh/.test(g.body)) bad.push(`${pg} served WITH the featured history to the crew (it is served only once the engine field is read)`); } return bad; }
ok((await gateBad(crewPage)).length === 0, "4 the previews answer a stranger and a forged cookie with the platform's own 404, the crew with a noindex page, and the served page carries no featured history: " + ((await gateBad(crewPage)).join("; ") || "ok"));
{ const vj = JSON.parse(fs.readFileSync("vercel.json", "utf8")); for (const [src, pg] of [["/preview/home", "preview-home"], ["/preview/find", "preview-find"]]) { const r = (vj.rewrites || []).filter(x => x.source === src); ok(r.length === 1 && r[0].destination === "/api/crewPage?page=" + pg && r[0].has && r[0].has.length === 1 && r[0].has[0].key === "gas_crew", `4 vercel.json routes ${src} only with the crew cookie`); } }
{ const leaky = async (req, res) => { const m = await imp("lib/preview/previewPages.js"); res.setHeader("Content-Type", "text/html"); return res.status(200).send(/preview-find/.test(req.url) ? m.findHtml() : m.homeHtml()); }; const bad = await gateBad(leaky); ok(bad.length >= 2, `4 mutant: a preview served with no cookie gate is caught (${bad.length} findings)`);
  const wired = async (req, res) => { const m = await imp("lib/preview/previewPages.js"); res.setHeader("Content-Type", "text/html"); res.setHeader("X-Robots-Tag", "noindex, nofollow"); return res.status(200).send(m.homeHtml({ featuredHistory: soldFixture(), allowData: true, now: NOW }).replace("<head>", '<head><meta name="robots" content="noindex, nofollow">')); };
  const bad2 = await gateBad(async (req, res) => { if (/preview-home/.test(req.url) && /gas_crew=v1\.\d+\.[A-Za-z0-9_-]{20,}/.test(req.headers.cookie || "")) return wired(req, res); return crewPage(req, res); }); ok(bad2.some(x => /featured history/.test(x)), `4 mutant: the section wired into the served preview is caught (${bad2.join("; ") || "NOT CAUGHT"})`); }
// the live pages, the sitemap and the public sources carry neither the section nor its field
const FH = /data-featured-history|featuredHistory|class="fh[ -"]|fh-photo|fh-prev/;
const renderPub = async (mod, url) => { const { default: h } = await imp("api/" + mod + ".js"); return await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(x) { r(String(x)); return res; }, end(x) { r(String(x || "")); return res; }, json(o) { r(JSON.stringify(o)); return res; } }; Promise.resolve(h({ method: "GET", url, query: Object.fromEntries(new URL("https://goasksam.com" + url).searchParams), headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res)).catch(() => r("")); setTimeout(() => r(""), 25000); }); };
const LIVE = [["home", "home", "/"], ["buy", "buy", "/find"], ["marketCheck", "marketCheck", "/market-check"], ["sellNext", "sellNext", "/api/sellNext"], ["about", "about", "/about"], ["business", "business", "/business"], ["sitemapPages", "sitemapPages", "/sitemap-pages.xml"]];
const livePages = {}; for (const [n, mod, url] of LIVE) livePages[n] = await renderPub(mod, url);
ok(Object.values(livePages).every(h => h.length > 200), `4 every live page rendered (${Object.entries(livePages).map(([k, v]) => k + " " + v.length).join(", ")})`);
const liveBad = pages => Object.entries(pages).filter(([n, h]) => FH.test(h) || /\/preview\//.test(h) && n === "sitemapPages").map(([n]) => n);
ok(liveBad(livePages).length === 0, "4 no live page, and not the sitemap, contains the featured history section, its field, or a /preview address: " + (liveBad(livePages).join(", ") || "ok"));
{ const bad = liveBad({ ...livePages, home: livePages.home.replace("</body>", featuredHistoryHtml(soldFixture(), NOWOPT) + "</body>") }); ok(bad.includes("home"), `4 mutant: the section wired into the live homepage is caught (${bad.join(", ") || "NOT CAUGHT"})`);
  const bad2 = liveBad({ ...livePages, buy: livePages.buy.replace("</body>", "<script>var d={featuredHistory:{kind:'sold'}}</script></body>") }); ok(bad2.includes("buy"), `4 mutant: the field in a live Find page is caught (${bad2.join(", ") || "NOT CAUGHT"})`);
  const bad3 = liveBad({ ...livePages, sitemapPages: livePages.sitemapPages.replace("</urlset>", "<url><loc>https://goasksam.com/preview/home</loc></url></urlset>") }); ok(bad3.includes("sitemapPages"), `4 mutant: a preview address in the sitemap is caught (${bad3.join(", ") || "NOT CAUGHT"})`); }
{ const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === "node_modules" ? [] : walk(d + "/" + e.name)) : /\.(js|mjs|html|json|xml)$/.test(e.name) ? [d + "/" + e.name] : []);
  const files = [...walk("api"), ...walk("public"), ...walk("lib")].filter(f => f !== "lib/preview/previewPages.js"), SRC = /featuredHistory|data-featured-history|featured-history/;
  const hits = files.filter(f => SRC.test(fs.readFileSync(f, "utf8"))); ok(hits.length === 0, `4 the featured history field and section appear in no public source file (${files.length} files read; found in: ${hits.join(", ") || "none"})`);
  ok(SRC.test("export const x = { featuredHistory: 1 }") && SRC.test('<section data-featured-history="sold">'), "4 mutant: a public file that carries the field or the section is caught by the same scan"); }
await b.close();
out.forEach(l => console.log(l)); console.log(`homeFindPreviewCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
