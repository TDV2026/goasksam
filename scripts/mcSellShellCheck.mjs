// MARKET CHECK AND SELL ON THE SHARED SHELL (Lane E, Nov 8 2026, Sam's approved brief docs/design/market-check-sell-brief-full.md; stages 2 to 4: the shell on both, the two entry pages).
// THE CLASS: a page that has its own navigation next to the shared one, a shell that restyles what it wraps, an entry page whose figures are written by the page, or a section drawn from a field that is half there. Each is checked on BOTH products (Market Check and Sell), entry and results, not on one example:
//   1. SHELL, both products, entry and results: exactly one Find header (the shared function's own markup) with the product's cream pill, no old left navigation (no #gas-rail, #gas-scrim, mobile bar, floating sign in bar), the Find rail configured for the product (+ New check / Recent Market Checks, + New analysis / Recent selling analyses), one footer after the content, and nothing of the results page's own text, scripts or markup changed (the live <main> is byte identical, the live scripts are identical except the one preview script path).
//   2. SCOPE: the shell stylesheet for a results page selects the shell's own elements only (never :root, body or an element a results page owns), so a protected page cannot be restyled by it.
//   3. ENTRY: the exact approved copy, chips, placeholder and order; no date line; the engine's example sales and Sell example print as written, only when complete (three sales each with a photo, a link, a title and the price line), a failed read prints a visible line and a null prints nothing; no figure is written by the page.
//   4. BROWSER (Chrome): the header, rail and footer compute the same styles as /preview/find at 1440 and 390, no horizontal overflow, no page error, the rail's recent list comes from the product's own history and follows a new entry, the results container is wider than before.
//   5. ROUTING: the three crew routes are rewritten only with the signed crew cookie, the function bundles what the live handlers read, and a stranger gets the platform 404.
// Mutants: old navigation left in, the wrong cream pill, a :root token in the shell sheet, a changed eyebrow, an entry section drawn from two sales, a Sell address left on /sell, a missing footer, each caught. Offline.
//   node scripts/mcSellShellCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
process.env.CURTAIN_CREW_CODE = "fixture-crew-code"; process.env.LAUNCH_STAGE = "2"; for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) delete process.env[k];
globalThis.fetch = async () => { throw new Error("no network in this check"); };
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
const imp = (f, q = "") => import(pathToFileURL(path.join(ROOT, f)).href + q);
const { mintCrewCookieValue } = await imp("lib/_crew.js"); const crew = "gas_crew=" + mintCrewCookieValue();
async function call(handler, url, cookie) { const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, writeHead(c) { this.code = c; return this; }, status(c) { this.code = c; return this; }, send(x) { this.body = String(x); return this; }, end(x) { this.body = String(x || ""); return this; }, json(o) { this.body = JSON.stringify(o); return this; } };
  const u = new URL(url, "https://goasksam.com"); await handler({ method: "GET", url, query: Object.fromEntries(u.searchParams), headers: cookie ? { cookie, host: "goasksam.com" } : { host: "goasksam.com" }, socket: {}, body: null }, res); return res; }
const CP = await imp("api/crewPage.js"), SH = await imp("lib/preview/mcSellPreview.js"), PP = await imp("lib/preview/previewPages.js");
const MC = (await imp("api/marketCheck.js")).default, SELL = (await imp("api/sell.js")).default;
const { SHARED } = PP, { KINDS } = SH;
const preview = async (page, qs = "") => (await call(CP.default, "/api/crewPage?page=" + page + qs, crew)).body;
const LIVE = { mc: (await call(MC, "/market-check?q=2001+BMW+M3", crew)).body, sell: (await call(SELL, "/sell?car=2006+BMW+M5", crew)).body };
const text = h => h.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&middot;/g, "·").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const mainOf = h => (/<main class="wrap">[\s\S]*?<\/main>/.exec(h) || [""])[0];
const scriptsOf = h => [...h.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].map(m => m[0]);
const count = (h, re) => (h.match(re) || []).length;
const OLD_NAV = [/id="gas-rail"/, /id="gas-scrim"/, /<header class="gas-mhead"/, /class="gas-signbar"/, /class="gas-signbar-m"/, /class="gas-navitem"/];

const COPY = {
  mc: { eyebrow: "MARKET CHECK · COMPLETED SALES", headline: "What have cars like yours sold for?", line: "Explore actual completed sales, with the individual transactions behind every result.", ph: "e.g. 2001 BMW M3 manual", under: "Completed sales only. Every result links to its source.", chips: ["2001 BMW M3 manual", "2018 Porsche 911 GT3", "2006 Ford GT"], rail: ["New check", "Recent Market Checks"], tab: "Market Check", section: "The sales behind the numbers" },
  sell: { eyebrow: "SELL · SELLING INTELLIGENCE", headline: "Where should you sell your car?", line: "See where similar cars have sold, how different auction platforms perform and what the evidence suggests for your car.", ph: "e.g. 2006 BMW M5", under: "Platform performance · Selling strategy · PowerSeller options", chips: ["2006 BMW M5", "2004 Porsche 911 Carrera", "1994 Toyota Land Cruiser"], rail: ["New analysis", "Recent selling analyses"], tab: "Sell", section: "Different cars. Different ways to sell." }
};
const SALES = { sales: [1, 2, 3].map(i => ({ title: `${2000 + i} BMW M3 (sale ${i})`, soldLine: `Sold for $${40 + i},000`, mileageLine: `${i}0,000 miles`, platformLine: "Bring a Trailer", dateLine: `Sold Oct ${i}, 2026`, photo_url: `https://example.test/p${i}.jpg`, url: `https://example.test/sale${i}` })) };
const SELLEX = { cars: [{ title: "2006 BMW M5", line: "Sold most often on Bring a Trailer in this record." }, { title: "1994 Toyota Land Cruiser", line: "Sold most often on Cars & Bids in this record." }] };

// ---------- the assertions, run against a module (the real one, then each mutant) ----------
function assertions(M, label, { entry, results }) {
  const bad = [];
  const chk = (c, m) => { if (!c) bad.push(m); };
  for (const kind of ["mc", "sell"]) {
    const k = KINDS[kind], c = COPY[kind], hdr = SHARED.header(k.active), ftr = SHARED.footer();
    // 1. shell on the entry page and on the results page
    for (const [where, html] of [["entry", entry[kind]], ["results", results[kind]]]) {
      const w = `${kind} ${where}`;
      chk(count(html, /<header class="gh"/g) === 1 && html.includes(hdr), `${w}: exactly one header and it is the shared Find header's own markup for ${k.active}`);
      chk(count(html, /aria-current="page"/g) === 1 && new RegExp(`aria-current="page">${c.tab}</a>`).test(html), `${w}: one cream pill and it is ${c.tab}`);
      chk(count(html, /<footer class="ft"/g) === 1 && html.includes(ftr), `${w}: one footer and it is the shared footer`);
      chk(OLD_NAV.every(re => !re.test(html)), `${w}: no old left navigation, mobile bar or floating sign in bar (${OLD_NAV.filter(re => re.test(html)).map(String).join(" ")})`);
      chk(html.includes(`<aside class="rail" aria-label="${k.aria}" data-kind="${k.active}">`) && html.includes(`${c.rail[0]}</a>`) && html.includes(`>${c.rail[1]}</div>`), `${w}: the Find rail for ${kind}: + ${c.rail[0]} and ${c.rail[1]}`);
      chk(!/<aside class="rail"[\s\S]*?<\/aside>/.exec(html)[0].match(/href="\/(about|business|terms|privacy|whats-new|feedback)/), `${w}: no footer links inside the rail`);
      chk(html.indexOf('<footer class="ft"') > html.indexOf("<main"), `${w}: the footer follows the content`);
      chk(!/[–—]/.test(text(html).replace(/Sam[’']s? /g, "")) || where === "results", `${w}: no em or en dash in the page's own words`);
    }
    // 2. the results page: nothing inside changed
    const live = LIVE[kind], wrapped = results[kind];
    chk(mainOf(wrapped) === mainOf(live) && mainOf(live).length > 50, `${kind} results: the live <main> (the results container) is byte identical`);
    const a = scriptsOf(live), b = scriptsOf(wrapped).filter(s => s !== `<script>${SH.RAIL_JS}</script>`);
    const norm = s => s.replace(/<script src="\/obx\.[^"]+\/onebox\.js"><\/script>/, "<script src=ONEBOX></script>").replace(`<script src="${SH.PREVIEW_OBX_SRC}"></script>`, "<script src=ONEBOX></script>").split("/preview/sell").join("/sell");
    chk(a.map(norm).join("\n") === b.map(norm).join("\n"), `${kind} results: the live scripts are the same scripts (only the preview address path differs)`);
    if (kind === "mc") chk(wrapped.includes(`src="${SH.PREVIEW_OBX_SRC}"`) && !/src="\/obx\./.test(wrapped), "mc results: the page loads the preview's own copy of onebox.js (its one path test widened), never the live file edited");
    else chk(!/"\/sell\?" \+ u\.toString\(\)/.test(wrapped) && wrapped.includes('"/preview/sell?" + u.toString()') && wrapped.includes(': "/preview/sell";'), "sell results: every address the page pushes stays in the preview");
    // 3. entry copy, exactly
    const e = entry[kind], et = text(e);
    chk(et.includes(c.eyebrow) && et.includes(c.headline) && et.includes(c.line) && et.includes(c.under), `${kind} entry: the approved eyebrow, headline, supporting line and ${kind === "mc" ? "trust" : "benefit"} line, exactly`);
    chk(e.includes(`placeholder="${c.ph}"`) && !/value="[^"]/.test(/<form class="sb"[\s\S]*?<\/form>/.exec(e)[0]), `${kind} entry: the placeholder is "${c.ph}" and the box is not prefilled`);
    chk(e.includes(`action="${k.path}"`) && e.includes(`name="${k.param}"`), `${kind} entry: the search submits to the product's own address with ${k.param}`);
    const pills = [...e.matchAll(/<a class="pill" href="([^"]+)">([^<]+)<\/a>/g)];
    chk(pills.map(p => p[2]).join("|") === c.chips.join("|") && pills.every((p, i) => p[1] === `${k.path}?${k.param}=${encodeURIComponent(c.chips[i])}`), `${kind} entry: the three chips, in order, each running its own search`);
    const vis = e.replace(/<h1 class="sr">[\s\S]*?<\/h1>/, ""), at = x => vis.indexOf(x);
    chk(at(c.eyebrow) >= 0 && at(c.eyebrow) < at(c.headline) && at(c.headline) < at(c.line) && at(c.line) < at('<form class="sb"') && at('<form class="sb"') < at(c.under) && at(c.under) < at('class="pills"'), `${kind} entry: the order eyebrow, headline, line, search, ${kind === "mc" ? "trust" : "benefit"} line, chips`);
    chk(!/\b(Updated|as of|Last updated)\b/i.test(et) && !/20\d\d/.test(et.replace(/2001|2018|2006|2004|1994|2026/g, "")), `${kind} entry: no updated date on the empty page`);
    chk(!/class="proof"|data-example-sales|data-sell-example/.test(e), `${kind} entry: no evidence section while the engine's field is absent`);
    chk(!/<canvas|<svg[^>]*class="(chart|trend)|confidence/i.test(e), `${kind} entry: no chart, trend or confidence score`);
  }
  // 4. the fields: printed as written, only when complete, failure visible, null silent
  const withSales = M.entryHtml("mc", { exampleSales: SALES }), sec = /<section class="proof" data-example-sales[\s\S]*?<\/section>/.exec(withSales);
  chk(!!sec && sec[0].includes("The sales behind the numbers") && count(sec[0], /<a class="pc"/g) === 3 && SALES.sales.every(s => [s.title, s.soldLine, s.mileageLine, s.platformLine, s.dateLine].every(t => sec[0].includes(t)) && sec[0].includes(`href="${s.url}"`) && sec[0].includes(s.photo_url)), "mc entry: three cards, each with the photo, title, price line, miles, platform and date as the engine wrote them, each linking to its sale");
  chk(!!sec && /target="_blank" rel="noopener"/.test(sec[0]), "mc entry: a sale opens in a new tab with noopener");
  const half = [{ sales: SALES.sales.slice(0, 2) }, { sales: SALES.sales.map((s, i) => i ? s : { ...s, photo_url: "" }) }, { sales: SALES.sales.map((s, i) => i ? s : { ...s, url: "javascript:alert(1)" }) }, { sales: SALES.sales.map((s, i) => i ? s : { ...s, soldLine: "" }) }, { sales: [] }, {}, null];
  chk(half.every(f => !/data-example-sales/.test(M.entryHtml("mc", { exampleSales: f }))), "mc entry: a field that is not complete (two sales, no photo, a bad link, no price line, none, empty, null) draws no section");
  const wsell = M.entryHtml("sell", { sellExample: SELLEX });
  chk(/data-sell-example/.test(wsell) && wsell.includes("Different cars. Different ways to sell.") && SELLEX.cars.every(c => text(wsell).includes(c.title) && text(wsell).includes(c.line)) && !/guarantee|best price|will sell for/i.test(text(wsell)), "sell entry: the engine's example prints as written under its heading, with no guarantee wording");
  chk(!/data-sell-example/.test(M.entryHtml("sell", { sellExample: { cars: [SELLEX.cars[0]] } })) && !/data-sell-example/.test(M.entryHtml("sell", { sellExample: null })), "sell entry: one car or none draws no section");
  chk(/data-could-not-read="mc"/.test(M.entryHtml("mc", { readError: "Could not read the example sales." })) && !/data-could-not-read/.test(M.entryHtml("mc", {})), "entry: a failed read prints its visible line, a null prints nothing");
  // 5. scope: the results shell sheet selects only the shell's own elements
  const css = M.RESULTS_SHELL_CSS.replace(/\/\*[\s\S]*?\*\//g, ""), sels = [];
  for (const m of css.matchAll(/(?:^|\})\s*([^{}@]+)\{/g)) sels.push(...m[1].split(",").map(s => s.trim()).filter(Boolean));
  const OWN = /^(body\.mcs-col(?:>(?:\*|\.ft))?$|\.gh|\.ft|\.rail|\.mshell|\.wm|\.beta|\.tabs|\.new|\.rh|\.it|#gas-main)(?![\w-])/;
  const stray = sels.filter(s => !OWN.test(s));
  chk(stray.length === 0, `the results shell sheet selects the shell's own elements only; it also selects: ${stray.slice(0, 5).join(" | ")}`);
  chk(!/:root|\bbody\b|\bhtml\b/.test(css.replace(/@media[^{]*\{/g, "").replace(/body\.mcs-col(>[*.\w-]+)?\{[^}]*\}/g, "")), "the results shell sheet has no :root, body or html rule but the one full height column on body.mcs-col (its tokens sit on .gh, .ft and .rail, so a results page keeps its own --ink and --sec)");
  const gm = /#gas-main\s*\{[^}]*\}/.exec(css), gw = /#gas-main \.wrap\{[^}]*\}|#gas-main #ob\{[^}]*\}/g, widths = css.match(gw) || [];
  chk(!!gm && widths.length === 2 && widths.every(w => /(padding-left:40px;padding-right:40px|max-width:1180px)/.test(w)), "the only rules on the results container are its outer width and padding (#gas-main, .wrap padding, #ob max-width)");
  return bad;
}

// ---------- the real module ----------
const entry = { mc: await preview("preview-market-check"), sell: await preview("preview-sell") };
const results = { mc: await preview("preview-market-check", "&q=2001+BMW+M3"), sell: await preview("preview-sell", "&car=2006+BMW+M5") };
const bad0 = assertions(SH, "real", { entry, results }); for (const b of bad0) ok(false, b); ok(bad0.length === 0, "the shell, scope and entry assertions all hold on the real module");
ok(entry.mc !== entry.sell && /MARKET CHECK/.test(entry.mc) && /SELL ·/.test(entry.sell), "the two entry pages are two pages");

// ---------- mutants ----------
const SRC = fs.readFileSync("lib/preview/mcSellPreview.js", "utf8"), TMP = "lib/preview/_mcSellPreviewMut.mjs";
async function mutant(name, from, to, { rebuild = true } = {}) {
  const mut = from instanceof RegExp ? SRC.replace(from, to) : SRC.split(from).join(to); if (mut === SRC) { ok(false, `mutant ${name}: the fault applies`); return; }
  fs.writeFileSync(TMP, mut);
  try { const M = await imp(TMP, "?v=" + Math.random()); const r = { mc: M.wrapLive("mc", LIVE.mc), sell: M.wrapLive("sell", LIVE.sell) };
    const bad = assertions(M, name, { entry: { mc: M.entryHtml("mc"), sell: M.entryHtml("sell") }, results: r }); ok(bad.length > 0, `mutant ${name} is caught (${bad[0] || "NOT CAUGHT"})`); }
  catch (e) { ok(true, `mutant ${name} is caught (it throws: ${String(e.message).slice(0, 80)})`); }
  finally { fs.unlinkSync(TMP); }
}
await mutant("old navigation left in", "out = out.replace(open, () => `${header(k.active)}<div class=\"mshell\">${railHtml(k)}<div id=\"gas-main\">`);", "out = out.replace(open, m => `${header(k.active)}<div class=\"mshell\">${railHtml(k)}${m}<div id=\"gas-main\">`);");
await mutant("the wrong cream pill", "${header(k.active)}<div class=\"mshell\">", "${header(\"find\")}<div class=\"mshell\">");
await mutant("a :root token in the shell sheet", ".gh,.ft,.rail{${SHELL_TOKENS}}", ":root{${SHELL_TOKENS}}");
await mutant("a stray rule on a results element", "#gas-main{margin-left:0!important", ".inbox{border-radius:0}#gas-main{margin-left:0!important");
await mutant("a changed eyebrow", /MARKET CHECK .{1,6} COMPLETED SALES/, "MARKET CHECK SALES");
await mutant("an entry section from two sales", "s.length !== 3", "s.length < 2");
await mutant("a Sell address left on /sell", 'SELL_PATCHES = [[`: "/sell";', 'SELL_PATCHES = [[`: "/sell-never";');
await mutant("a missing footer", "out.replace(close, (m, ws) => `</main></div></div>${footer()}${ws}`)", "out.replace(close, (m, ws) => `</main></div></div>${ws}`)");
await mutant("the live main changed", "out = out.replace(AUTH_SIGNBAR_HTML, () => \"\");", "out = out.replace(AUTH_SIGNBAR_HTML, () => \"\").replace('<div id=\"ob\">', '<div id=\"ob\"><p>x</p>');");

// ---------- routing and exposure ----------
const V = JSON.parse(fs.readFileSync("vercel.json", "utf8")), rw = V.rewrites || [];
for (const [src, page] of [["/preview/market-check", "preview-market-check"], ["/preview/sell", "preview-sell"], ["/preview/market-check/onebox.js", "preview-onebox-js"]]) {
  const r = rw.find(x => x.source === src); ok(r && r.destination === "/api/crewPage?page=" + page && r.has && r.has[0].key === "gas_crew" && /v1/.test(r.has[0].value), `vercel.json: ${src} is rewritten to ${page} only with the signed crew cookie`);
  ok(!rw.some(x => x.source === src && !x.has), `vercel.json: ${src} has no rewrite without the cookie (a stranger gets the platform 404)`);
}
const inc = V.functions["api/crewPage.js"].includeFiles; ok(/public\/onebox\.html/.test(inc) && /public\/styles\.css/.test(inc) && /public\/js\/onebox\.js/.test(inc), "vercel.json: api/crewPage.js bundles the files the live handlers and the preview script read (" + inc + ")");
for (const p of ["preview-market-check", "preview-sell", "preview-onebox-js"]) { const r = await call(CP.default, "/api/crewPage?page=" + p, ""); ok(r.code === 404, `${p}: a stranger gets the 404 (${r.code})`); const c = await call(CP.default, "/api/crewPage?page=" + p, crew); ok(c.code === 200 && /noindex/.test(c.h["x-robots-tag"] || "") && /no-store/.test(c.h["cache-control"] || ""), `${p}: crew gets it, noindex, no-store`); }
ok((await call(CP.default, "/api/crewPage?page=preview-onebox-js", crew)).h["content-type"].startsWith("application/javascript"), "the preview script is served as JavaScript");
// the live pages still answer as they did: the preview imports them, it does not edit them
const git = (await import("node:child_process")).execFileSync("git", ["diff", "--name-only", "origin/main", "--", "api/marketCheck.js", "api/sell.js", "api/sellNext.js", "api/sellPage.js", "public/onebox.html", "public/js", "lib/appShell.js", "lib/authBar.js", "lib/sell", "lib/live/marketCheckLanding.js"], { encoding: "utf8" }).trim();
ok(git === "", "no live page file is edited: the live Market Check, Sell, results and shell files are untouched (" + (git || "none changed") + ")");

// ---------- the browser ----------
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) console.log("SKIP the browser part: no Chrome at " + CHROME);
else {
  const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core"), b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const ONEBOX = fs.readFileSync("public/js/onebox.js", "utf8");
  async function open(url, w, { init = null } = {}) {
    const p = await b.newPage(); await p.setViewport({ width: w, height: 900 }); p._err = []; p.on("pageerror", e => p._err.push(String(e).slice(0, 160)));
    await p.evaluateOnNewDocument(init ? "try{localStorage.clear();sessionStorage.clear();}catch(e){}(" + init.toString() + ")()" : "try{localStorage.clear();sessionStorage.clear();}catch(e){}");
    await p.setRequestInterception(true);
    p.on("request", async r => { const u = new URL(r.url());
      if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" });
      if (/^\/preview\/(market-check|sell|find)$/.test(u.pathname) || u.pathname === "/preview/market-check/onebox.js") { const page = { "/preview/market-check": "preview-market-check", "/preview/sell": "preview-sell", "/preview/find": "preview-find", "/preview/market-check/onebox.js": "preview-onebox-js" }[u.pathname], q = new URLSearchParams(u.search); q.set("page", page);
        const o = await call(CP.default, "/api/crewPage?" + q.toString(), crew); return r.respond({ status: o.code, contentType: o.h["content-type"] || "text/html", body: o.body }); }
      const loc = /^\/obx\.[^/]+\/onebox\.js$/.test(u.pathname) ? "public/js/onebox.js" : (/^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname) ? "public/js/" + /^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname)[1] : null);
      if (loc && fs.existsSync(loc)) return r.respond({ status: 200, contentType: "application/javascript", body: fs.readFileSync(loc, "utf8") });
      if (/^\/api\//.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", body: "{}" }); r.respond({ status: 404, body: "" }); });
    await p.goto("https://goasksam.com" + url, { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 1200)); return p;
  }
  const STYLE = sel => { const el = document.querySelector(sel); if (!el) return null; const s = getComputedStyle(el), skip = sel === ".rail" ? ["height", "minHeight"] : sel === ".rail .new" ? ["width"] : []; return ["backgroundColor", "color", "fontFamily", "fontSize", "fontWeight", "lineHeight", "height", "minHeight", "borderRadius", "paddingTop", "paddingLeft", "marginLeft", "width", "borderRightWidth", "borderTopWidth", "justifyContent", "display"].filter(k => skip.indexOf(k) < 0).map(k => k + ":" + s[k]).join(";"); };
  const PARTS = [".gh", ".gh .wm b", ".gh .beta", ".tabs a", ".tabs a[aria-current]", ".tabs a.acct", ".rail", ".rail .new", ".ft", ".ft .wm b", ".ft nav a", ".ft .cp"];
  for (const w of [1440, 390]) {
    const f = await open("/preview/find", w), fs0 = await f.evaluate((P, S) => P.map(s => [s, new Function("sel", "return (" + S + ")(sel)")(s)]), PARTS, STYLE.toString());
    for (const [name, url, tab] of [["mc entry", "/preview/market-check", "Market Check"], ["sell entry", "/preview/sell", "Sell"], ["mc results", "/preview/market-check?q=2001+BMW+M3", "Market Check"], ["sell results", "/preview/sell?car=2006+BMW+M5", "Sell"]]) {
      const p = await open(url, w), st = await p.evaluate((P, S) => P.map(s => [s, new Function("sel", "return (" + S + ")(sel)")(s)]), PARTS, STYLE.toString());
      const diffs = st.filter(([s, v], i) => v !== fs0[i][1] && !(s === ".tabs a[aria-current]" && false)).map(([s, v], i) => s);
      // the active pill sits on a different tab, so compare it by its own computed look, not by position
      const same = st.every(([s, v], i) => v === fs0[i][1] || s === ".tabs a[aria-current]" || s === ".tabs a");
      ok(same, `${name} at ${w}: the header, rail and footer compute the same styles as Find (differs: ${diffs.join(", ") || "none"}; e.g. ${(st.find(([s, v], i) => v !== fs0[i][1]) || ["", ""])[1].slice(0, 90)} vs ${(fs0[st.findIndex(([s, v], i) => v !== fs0[i][1])] || ["", ""])[1].slice(0, 90)})`);
      const pill = await p.evaluate(() => { const a = document.querySelector(".tabs a[aria-current]"); const s = getComputedStyle(a); return a.textContent + "|" + s.backgroundColor + "|" + s.color; });
      ok(pill === `${tab}|rgb(248, 244, 236)|rgb(11, 49, 38)`, `${name} at ${w}: the cream pill is on ${tab} (${pill})`);
      const geo = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, rail: (document.querySelector(".rail") || {}).offsetWidth, old: !!document.querySelector("#gas-rail,#gas-scrim,.gas-mhead,.gas-signbar"), ob: (document.querySelector("#ob") || {}).offsetWidth || 0, foot: (document.querySelector(".ft") || { getBoundingClientRect: () => ({ top: 0 }) }).getBoundingClientRect().top + scrollY, last: Math.max(...[...document.querySelectorAll("main, #gas-main, .main")].map(e => e.getBoundingClientRect().bottom + scrollY)) }));
      ok(geo.sw <= geo.cw, `${name} at ${w}: no horizontal overflow (${geo.sw} > ${geo.cw})`);
      ok(!geo.old, `${name} at ${w}: no old navigation in the browser`);
      ok(w === 390 || geo.rail === 220, `${name} at ${w}: the rail is 220px wide (${geo.rail})`);
      ok(geo.foot >= geo.last - 1, `${name} at ${w}: the footer sits after the content, never over it (${Math.round(geo.foot)} vs ${Math.round(geo.last)})`);
      if (name.includes("results") && w === 1440) ok(geo.ob > 1040, `${name}: the results container is wider than the old 1040 cap (${geo.ob})`);
      ok(p._err.length === 0, `${name} at ${w}: no page error (${p._err.join(" | ")})`);
      await p.close(); }
    await f.close();
  }
  // the rail's recent list is the product's own history, and follows a new entry
  { const p = await open("/preview/market-check", 1440, { init: () => { try { sessionStorage.setItem("gas_ob_recent", JSON.stringify([{ q: "1995 Porsche 911", label: "1995 Porsche 911" }, { q: "2006 Ford GT", label: "2006 Ford GT" }])); localStorage.setItem("gas_sell_recent", JSON.stringify([{ key: "x", label: "NOT FOR MARKET CHECK", url: "/sell?car=x" }])); } catch (e) {} } });
    const items = await p.evaluate(() => [...document.querySelectorAll("#mc-rail-recent a")].map(a => a.textContent + "|" + a.getAttribute("href")) .concat([document.getElementById("mc-rail-head").hidden ? "head hidden" : document.getElementById("mc-rail-head").textContent]));
    ok(items.join(" ; ") === "1995 Porsche 911|/preview/market-check?q=1995%20Porsche%20911 ; 2006 Ford GT|/preview/market-check?q=2006%20Ford%20GT ; Recent Market Checks", "Market Check rail: its own recent history, each item reopening its search in the preview, headed Recent Market Checks, and not Sell's list (" + items.join(" ; ") + ")");
    await p.evaluate(() => sessionStorage.setItem("gas_ob_recent", JSON.stringify([{ q: "2020 BMW M3", label: "2020 BMW M3" }]))); const after = await p.evaluate(() => [...document.querySelectorAll("#mc-rail-recent a")].map(a => a.textContent));
    ok(after.join() === "2020 BMW M3", "Market Check rail: a new entry written by the page shows without a reload (" + after.join() + ")"); await p.close(); }
  { const p = await open("/preview/sell", 1440, { init: () => { try { localStorage.setItem("gas_sell_recent", JSON.stringify([{ key: "m5", label: "2006 BMW M5", url: "/sell?car=2006%20BMW%20M5&state=CA" }, { key: "bad", label: "evil", url: "//evil.test/x" }])); sessionStorage.setItem("gas_ob_recent", JSON.stringify([{ q: "NOT FOR SELL", label: "NOT FOR SELL" }])); } catch (e) {} } });
    const items = await p.evaluate(() => [...document.querySelectorAll("#mc-rail-recent a")].map(a => a.textContent + "|" + a.getAttribute("href")).concat([document.getElementById("mc-rail-head").textContent]));
    ok(items.join(" ; ") === "2006 BMW M5|/preview/sell?car=2006%20BMW%20M5&state=CA ; Recent selling analyses", "Sell rail: its own recent history, each item reopening its saved address in the preview, off site addresses dropped, and not Market Check's list (" + items.join(" ; ") + ")"); await p.close(); }
  { const p = await open("/preview/sell", 1440), items = await p.evaluate(() => ({ n: document.querySelectorAll("#mc-rail-recent a").length, hidden: document.getElementById("mc-rail-head").hidden })); ok(items.n === 0 && items.hidden, "Sell rail: with no history it is minimal, no list and no heading, no promotional copy"); await p.close(); }
  for (const [url, typed, want] of [["/preview/market-check", "2001 BMW M3 manual", "/preview/market-check?q=2001%20BMW%20M3%20manual"], ["/preview/sell", "2006 BMW M5", "/preview/sell?car=2006%20BMW%20M5"]]) {
    const p = await open(url, 1440), navs = []; p.on("request", r => { if (r.isNavigationRequest()) navs.push(new URL(r.url())); }); await p.evaluate(t => { document.getElementById("pq").value = t; }, typed);
    await Promise.all([p.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => {}), p.evaluate(() => document.getElementById("pq-form").requestSubmit())]);
    const to = navs[0] || new URL("https://x/none"); ok(to.pathname + to.search === want, `${url} entry: the search goes to its own results address with the words percent encoded, never a + (${to.pathname + to.search})`); await p.close(); }
  await b.close();
}
console.log(out.join("\n")); console.log(`mcSellShellCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
