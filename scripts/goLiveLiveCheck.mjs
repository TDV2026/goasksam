// goLiveLiveCheck (Lane E, Nov 10 2026): THE GO LIVE HEAD ON THE LIVE SITE, as a visitor would meet it after the flip, seen early through the crew look (?design=new with the signed crew cookie).
//   HEAD (no browser, read only, GET only): for every public route, the look's title, description, robots, canonical, Open Graph, Twitter and structured data equal the PUBLIC page's byte for byte, and the look answers X-Design: new.
//     This is the check that was missing when /sell?design=new carried noindex and /find?design=new answered today's page (Lane C, Nov 10).
//   BROWSER (--browser): the look at 1440 and 390: Find results and the rail, the Your searches button, the Account button opening the sign in card, the analytics script and the banner, one Sell search through to a result.
//   NOT RUN, said plainly: anything that needs a signed in ACCOUNT (the crew cookie is not an account).
// The crew cookie and the protection bypass are read from the Keychain (goasksam-crew, goasksam-bypass) in this process, never printed, written or put in an address. Run only in a gap, with no push lock open.
//   VISITOR (--visitor), THE SWITCH ON: fetches as a visitor, no cookie and no query, and holds each public route to the page it was BEFORE the flip (docs/go-live-public-baseline.json, recorded from the live site with the switch off by --record-baseline): the same status, robots meta and header, title, description, canonical, banner and
//     analytics script; X-Design: new; one h1; the examples on Find, Market Check, Sell, Tasks and Home exactly when /api/publicExamples has them for that page, and on Find and Market Check always; Tasks prints its live limit (3). It FAILS on a head with the switch off (no X-Design) and on a head whose pages show no examples.
//   --visitor --browser: the same visitor in Chrome (no cookie): the example cards VISIBLE with their images at 1440 and 390; the header's links and a click through; a Find, a Market Check and a Sell search each reaching its answer (live only); the Tasks limit on screen; the consent banner shown to a restricted visitor, Accept and Decline each setting the cookie and the track endpoint answering it; every entry page on a phone with no sideways scroll and one h1.
//   THE CREW LOOK (default) compares ?design=new with the crew cookie against the public page, so it only means anything with the switch OFF: with the switch on a crew fetch is the crew's page (noindex), never the public one, so the look comparison is skipped and says so; use --visitor.
//   --self-test: serves THIS TREE's handlers over a stored-pick world on a local port (no network) and runs the visitor mode against it: it must pass with the switch on and fail with it off, with the examples off, and with each of three faults put in.
//   node scripts/goLiveLiveCheck.mjs [--browser] [--no-head] [--visitor] [--record-baseline] [--self-test] [BASE]
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { execFileSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), ".."), args = process.argv.slice(2), BASE = args.find(a => /^https?:/.test(a)) || "https://goasksam.com", BROWSER = args.includes("--browser");
let pass = 0, fail = 0, notRun = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const skip = m => { notRun++; console.log("NOT RUN " + m); };
const { FREE_TASK_LIMIT } = await import(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib/tasks/limit.js")).href);
const realFetch = globalThis.fetch, VISITOR = args.includes("--visitor"), RECORD = args.includes("--record-baseline"), SELF = args.includes("--self-test"), BASEFILE = path.join(ROOT, "docs/go-live-public-baseline.json");
const { crewCookie } = await import(pathToFileURL(path.join(ROOT, "scripts/_crewCookie.mjs")).href);
const CREW = VISITOR || RECORD || SELF ? "n/a" : await crewCookie();
let BYP = ""; if (!SELF) try { BYP = execFileSync("security", ["find-generic-password", "-s", "goasksam-bypass", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
if (!CREW) { console.log("REFUSED no crew cookie (Keychain goasksam-crew)"); process.exit(1); }
const bypassH = () => BYP ? { "x-vercel-protection-bypass": BYP } : {};
const get = (p, look) => realFetch(BASE + p + (look ? (p.includes("?") ? "&" : "?") + "design=new" : ""), { redirect: "manual", headers: { ...bypassH(), ...(look ? { cookie: "gas_crew=" + CREW } : {}), "user-agent": "Mozilla/5.0 (goLiveLiveCheck)" } });
const META = n => new RegExp(`<meta\\b[^>]*\\bname=["']${n}["'][^>]*>`, "gi"), PROP = p => new RegExp(`<meta\\b[^>]*\\bproperty=["']${p}[^"']*["'][^>]*>`, "gi");
const SHAPES = { title: /<title\b[^>]*>[\s\S]*?<\/title>/gi, description: META("description"), robots: META("robots"), canonical: /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi, og: PROP("og:"), twitter: META("twitter:[^\"']*"), ld: /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi };
const tags = html => { const head = (/<head\b[\s\S]*?<\/head>/i.exec(html) || [html])[0], o = {}; for (const [k, re] of Object.entries(SHAPES)) o[k] = (k === "ld" ? html : head).match(re) || []; return o; };
const PIECES = [["the analytics script", /<script\b[^>]*\bsrc="\/api\/track\?js=1"/], ["the consent banner markup", /<div[^>]*gas-consent-banner/], ["the consent banner script", /<script>[^<]*(?:gasConsent|gas-consent-accept)/]];
const ROUTES = ["/", "/find", "/market-check", "/sell", "/tasks", "/about", "/how-sam-decides", "/whats-new", "/terms", "/privacy", "/business", "/feedback", "/history"];

// ---- THE VISITOR (switch on) -----------------------------------------------------------------------------------------------------------------------------------------------------------------
const BASE_ROUTES = [...ROUTES, "/history/porsche", "/history/1928-alfa-romeo-6c-spider/0110910"];
const ENTRY = { "/": ["data-featured-history", ["featured"]], "/find": ["data-find-examples", ["find", "findSales"]], "/market-check": ["data-mc-card", ["mcCard"]], "/sell": ["data-sell-card", ["sellCard"]], "/tasks": ["data-task-email", ["tasksEmail"]] };
const MUST = new Set(["/find", "/market-check"]);   // the order: examples present on Find and Market Check
const vget = async (base, p, fetchFn) => { const r = await fetchFn(base + p, { redirect: "manual", headers: { ...(base.startsWith("https") ? bypassH() : {}), "user-agent": "Mozilla/5.0 (goLiveLiveCheck visitor)" } }); return { status: r.status, h: r.headers, html: await r.text() }; };
const strip = h => String(h).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "");
const facts = r => { const t = tags(r.html); return { status: r.status, xRobots: r.h.get("x-robots-tag") || "", robots: (t.robots[0] || "").replace(/\s*\/>$/, ">"), title: t.title[0] || "", description: t.description[0] || "", canonical: t.canonical[0] || "", ld: t.ld.length, banner: /<div[^>]*gas-consent-banner/.test(r.html), track: /<script\b[^>]*\bsrc="\/api\/track\?js=1"/.test(r.html), h1: (strip(r.html).match(/<h1\b/gi) || []).length }; };
async function recordBaseline(base, fetchFn) { const routes = {}; for (const p of BASE_ROUTES) { const r = await vget(base, p, fetchFn); routes[p] = { ...facts(r), design: r.h.get("x-design") || "" }; } return { recordedAt: new Date().toISOString(), base, note: "the public pages with NEW_DESIGN off, fetched with no cookie and no query (goLiveLiveCheck --record-baseline)", routes }; }
async function visitorRun(base, baseline, fetchFn, say = () => {}) {
  let np = 0, nf = 0; const c = (cond, m) => { if (cond) np++; else { nf++; say("FAIL " + m); } };
  const endpoint = async name => { try { const r = await fetchFn(base + "/api/publicExamples?name=" + name, { headers: base.startsWith("https") ? bypassH() : {} }); return (await r.json()).data ?? null; } catch { return null; } };
  const E = {}; for (const n of ["find", "findSales", "featured", "mcCard", "sellCard", "tasksEmail"]) E[n] = await endpoint(n);
  for (const p of BASE_ROUTES) {
    const B = baseline.routes[p]; if (!B) { c(false, `${p}: the baseline has no entry for it`); continue; }
    const r = await vget(base, p, fetchFn), F = facts(r);
    c(F.status === B.status, `${p}: a visitor gets status ${B.status} as before (${F.status})`);
    if (B.status !== 200) continue;
    c(r.h.get("x-design") === "new", `${p}: a visitor is served the new design (X-Design ${r.h.get("x-design") || "none"})`);
    c(F.robots === B.robots && F.xRobots === B.xRobots, `${p}: robots is what it was before the flip: meta ${B.robots || "none"}, header ${B.xRobots || "none"} (now meta ${F.robots || "none"}, header ${F.xRobots || "none"})`);
    c(F.title === B.title && F.description === B.description && F.canonical === B.canonical, `${p}: title, description and canonical are what they were before the flip`);
    c(F.ld >= B.ld, `${p}: structured data kept (${B.ld} before, ${F.ld} now)`);
    c(F.banner === (B.banner || B.track) && F.track === B.track, `${p}: the analytics script is where it was and a page that loads it offers the consent choice (banner ${B.banner} before, ${F.banner} now; analytics script ${B.track} before, ${F.track} now)`);
    c(F.h1 === 1, `${p}: one h1 (${F.h1})`);
    c(!/\/preview[/?"']/.test(strip(r.html).replace(/indexOf\("\/preview\/"\)/g, "")), `${p}: no crew preview address in the page`);
    const en = ENTRY[p]; if (en) { const has = r.html.includes(en[0]), data = en[1].some(n => E[n] != null);
      c(has === data, `${p}: the example section is on the page exactly when /api/publicExamples has it (page ${has}, endpoint ${data})`);
      if (MUST.has(p)) c(has, `${p}: the examples are on the page (a visitor sees them)`); }
    if (p === "/tasks") c(new RegExp("\\b" + FREE_TASK_LIMIT + " active Tasks").test(strip(r.html).replace(/<[^>]+>/g, " ")), `${p}: Tasks prints the live limit, ${FREE_TASK_LIMIT} (read from lib/tasks/limit.js, never typed here)`);
  }
  return { pass: np, fail: nf };
}
if (RECORD) { const b = await recordBaseline(BASE, realFetch); fs.writeFileSync(BASEFILE, JSON.stringify(b, null, 1) + "\n"); console.log(`recorded ${Object.keys(b.routes).length} routes from ${BASE} into docs/go-live-public-baseline.json`); console.log(Object.entries(b.routes).map(([p, x]) => `${p} ${x.status}${x.design ? " X-Design " + x.design : ""} robots ${x.robots || "none"}`).join("\n")); process.exit(0); }

async function visitorBrowser(base, { searches }) {
  const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core"), live = base.startsWith("https"), settle = ms => new Promise(r => setTimeout(r, ms));
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] }); let np = 0, nf = 0; const c = (cond, m) => { if (cond) np++; else { nf++; console.log("FAIL " + m); } };
  const open = async (w, extra = {}) => { const ctx = await b.createBrowserContext(), pg = await ctx.newPage(); await pg.setViewport({ width: w, height: 900, isMobile: w < 500, hasTouch: w < 500 }); await pg.setExtraHTTPHeaders({ ...(live ? bypassH() : {}), ...(live ? { "x-vercel-set-bypass-cookie": "samesitenone" } : {}), ...extra }); pg.__errs = []; pg.on("pageerror", e => pg.__errs.push(String(e.message).slice(0, 100))); pg.__ctx = ctx; return pg; };
  const done = async pg => { try { await pg.__ctx.close(); } catch {} };
  try {
    for (const w of [1440, 390]) {
      for (const [p, sel, what] of [["/find", "[data-find-examples]", "Find"], ["/market-check", "[data-mc-card]", "Market Check"]]) {
        const pg = await open(w); await pg.goto(base + p, { waitUntil: "load", timeout: 60000 }).catch(() => {}); await settle(2500);
        const s = await pg.evaluate(sel0 => { const e = document.querySelector(sel0); if (!e) return null; const r = e.getBoundingClientRect(), imgs = [...e.querySelectorAll("img")]; return { visible: r.width > 0 && r.height > 0, imgs: imgs.length, loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length, over: document.documentElement.scrollWidth > innerWidth + 1, h1: document.querySelectorAll("h1").length, w: r.width }; }, sel);
        c(!!s && s.visible, `${what} @${w}: the example cards are on screen (${s ? "visible" : "absent"})`);
        if (s && live) c(s.imgs === s.loaded, `${what} @${w}: every example image loaded (${s.loaded} of ${s.imgs})`);
        if (s) c(!s.over && s.h1 === 1, `${what} @${w}: one h1 and no sideways scroll (h1 ${s.h1}, overflow ${s.over})`);
        c(pg.__errs.length === 0, `${what} @${w}: no page errors (${pg.__errs.join("; ")})`); await done(pg);
      }
      for (const p of ["/", "/sell", "/tasks", "/about", "/how-sam-decides", "/whats-new", "/privacy"]) {   // the phone view of every other entry page
        const pg = await open(w); await pg.goto(base + p, { waitUntil: "load", timeout: 60000 }).catch(() => {}); await settle(1200);
        const s = await pg.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth + 1, h1: document.querySelectorAll("h1").length, header: !!document.querySelector("header") })); c(!s.over && s.h1 === 1 && s.header && pg.__errs.length === 0, `${p} @${w}: header, one h1, no sideways scroll, no page errors (${JSON.stringify(s)} ${pg.__errs.join("; ")})`); await done(pg);
      }
    }
    { const pg = await open(1440); await pg.goto(base + "/tasks", { waitUntil: "load", timeout: 60000 }).catch(() => {}); const t = await pg.evaluate(() => document.body.innerText); c(new RegExp("\\b" + FREE_TASK_LIMIT + " active Tasks").test(t), `Tasks @1440: the page shows the live limit, ${FREE_TASK_LIMIT}`); await done(pg); }
    { const pg = await open(1440); await pg.goto(base + "/", { waitUntil: "load", timeout: 60000 }).catch(() => {}); const hrefs = await pg.evaluate(() => [...new Set([...document.querySelectorAll("header a[href^='/']")].map(a => a.getAttribute("href").split("#")[0]))]);
      c(hrefs.length >= 4, `Home: the header has its links (${hrefs.join(" ")})`); const bad = []; for (const h of hrefs) { const r = await realFetch(base + h, { redirect: "manual", headers: live ? bypassH() : {} }); if (r.status !== 200) bad.push(h + " " + r.status); } c(bad.length === 0, `Home: every header link answers 200 (${bad.join(", ") || hrefs.length + " links"})`);
      const to = hrefs.find(h => h === "/find"); if (to) { await Promise.all([pg.waitForNavigation({ timeout: 30000 }).catch(() => {}), pg.click("header a[href='/find']")]); c(new URL(pg.url()).pathname === "/find", `Home: clicking Find in the header goes to /find (${pg.url()})`); } await done(pg); }
    // CONSENT: a restricted visitor (the test header the product honours) sees the banner; Accept and Decline each set the cookie and the track endpoint answers it
    for (const choice of ["accept", "decline"]) { const pg = await open(1440, { "x-gas-region": "restricted" }); await pg.goto(base + "/", { waitUntil: "load", timeout: 60000 }).catch(() => {}); await settle(2500);
      const shown = await pg.evaluate(() => { const e = document.getElementById("gas-consent-banner"); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; }); c(shown, `consent (${choice}): a restricted visitor is shown the banner`);
      if (shown) { await pg.click(".gas-consent-" + choice); await settle(1200); const after = await pg.evaluate(() => ({ cookie: document.cookie, hidden: document.getElementById("gas-consent-banner").hidden })), want = choice === "accept" ? "granted" : "declined";
        c(after.cookie.includes("gas_consent=" + want) && after.hidden, `consent (${choice}): the cookie is ${want} and the banner is gone`);
        const j = await pg.evaluate(() => fetch("/api/track?consent=1", { credentials: "same-origin", cache: "no-store" }).then(r => r.json()).catch(() => null)); c(!!j && j.consent === want, `consent (${choice}): the track endpoint answers ${want} (${j && j.consent})`); } await done(pg); }
    if (searches) {
      { const pg = await open(1440); await pg.goto(base + "/find?q=Porsche%20911", { waitUntil: "domcontentloaded", timeout: 60000 }); await pg.waitForSelector("article.car", { timeout: 90000 }).catch(() => {}); await settle(3000); const n = await pg.evaluate(() => document.querySelectorAll("article.car").length); c(n > 0, `Find search @1440: a search for Porsche 911 draws cars (${n})`); await done(pg); }
      { const pg = await open(390); await pg.goto(base + "/market-check", { waitUntil: "load", timeout: 60000 }); const typed = await pg.evaluate(() => { const i = document.querySelector("textarea, input[type=text], input:not([type])"); if (!i) return false; i.focus(); i.value = "1995 Porsche 911 Carrera"; i.dispatchEvent(new Event("input", { bubbles: true })); return true; });
        if (typed) { await pg.keyboard.press("Enter"); await settle(30000); } const m = await pg.evaluate(() => ({ url: location.pathname + location.search, money: (document.body.innerText.match(/\$\d[\d,]+/g) || []).length })); c(typed && m.money > 0, `Market Check search @390: reaches a result with dollar figures (${m.url}, ${m.money})`); await done(pg); }
      { const pg = await open(1440); await pg.goto(base + "/sell", { waitUntil: "load", timeout: 60000 }); const typed = await pg.evaluate(() => { const i = document.querySelector("textarea, input[type=text], input:not([type])"); if (!i) return false; i.focus(); i.value = "2008 Porsche 911 Carrera"; i.dispatchEvent(new Event("input", { bubbles: true })); return true; });
        let r = { pick: false, money: 0 }; if (typed) { await pg.keyboard.press("Enter"); for (let k = 0; k < 14; k++) { await settle(5000); r = await pg.evaluate(() => ({ pick: /SAM'?S PICK/i.test(document.body.innerText), money: (document.body.innerText.match(/\$\d[\d,]+/g) || []).length })); if (r.pick && r.money) break; await pg.evaluate(() => { const e = [...document.querySelectorAll("button.chip, .chip, .chips button, .qchips button, [data-chip], .opts button")].find(x => x.getBoundingClientRect().width > 0); if (e) e.click(); }); } }
        c(r.pick && r.money > 0, `Sell @1440: a search answered through its questions reaches Sam's pick (${r.money} dollar figures)`); await done(pg); }
    }
  } finally { await b.close(); }
  return { pass: np, fail: nf };
}
if (VISITOR) { const base = JSON.parse(fs.readFileSync(BASEFILE, "utf8")), r = await visitorRun(BASE, base, realFetch, console.log); console.log(`goLiveLiveCheck visitor: ${r.pass} passed, ${r.fail} failed (${BASE}, baseline ${base.recordedAt})`);
  let bf = 0; if (args.includes("--browser")) { const br = await visitorBrowser(BASE, { searches: true }); console.log(`goLiveLiveCheck visitor browser: ${br.pass} passed, ${br.fail} failed (${BASE})`); bf = br.fail; }
  process.exit(r.fail || bf ? 1 : 0); }
if (args.includes("--self-test-mutants")) {
  const MUT = [["a noindex reaching the public (the head's robots not lifted)", "lib/_publicHead.js", '["robots", META("robots")],', ""], ["the consent banner not lifted", "lib/_publicHead.js", "if (L.includes(CONSENT_BANNER_HTML) && !h.includes(CONSENT_BANNER_HTML)) end.push(CONSENT_BANNER_HTML);", ""],
    ["Sell loading the analytics script with no consent choice", "lib/_publicHead.js", "if (track && !L.includes(CONSENT_BANNER_HTML) && !h.includes(CONSENT_BANNER_HTML)) {", "if (false) {"], ["the consent banner never shown to a restricted visitor (browser)", "lib/consentBanner.js", 'if (j && j.region_class === "restricted") showBanner();', "void 0;"], ["Find showing a visitor no cars", "api/crewPage.js", "PUBLIC_CTX.getStore() ? publicFindExamples(req) : readField(", "false ? publicFindExamples(req) : readField("], ["the Tasks page printing the crew limit to a visitor", "api/crewPage.js", "PUBLIC_CTX.getStore() ? taskLimitFor(isCrewRequest(req) === true) : crewLimitMax()", "crewLimitMax()"]];
  let bad = 0; for (const [name, file, from, to] of MUT) { const f = path.join(ROOT, file), orig = fs.readFileSync(f, "utf8"); if (!orig.includes(from)) { console.log("MUTANT NOT APPLICABLE: " + name); bad++; continue; } let code = 0;
    try { fs.writeFileSync(f, orig.replace(from, () => to)); try { execFileSync("node", [fileURLToPath(import.meta.url), "--self-test", ...(args.includes("--browser") ? ["--browser"] : [])], { stdio: "pipe" }); } catch (e) { code = e.status || 1; } } finally { fs.writeFileSync(f, orig); }
    console.log((code ? "caught   " : "MISSED   ") + "without " + name); if (!code) bad++; }
  console.log(bad ? "goLiveLiveCheck visitor mutants: " + bad + " not caught" : "goLiveLiveCheck visitor mutants: all " + MUT.length + " caught"); process.exit(bad ? 1 : 0); }
if (SELF) { await selfTest(); }
async function selfTest() {
  const http = await import("node:http"), { visitorWorld } = await import(pathToFileURL(path.join(ROOT, "scripts/_visitorWorld.mjs")).href);
  await visitorWorld(ROOT);   // the stored picks, the fake database as fetch
  for (const k of ["NEW_DESIGN", "PUBLIC_EXAMPLES", "NEW_DESIGN_DATE"]) delete process.env[k]; process.env.SELL_NEXT_ON = "1";   // the Sell production serves: the analytics script and no banner
  const imp = f => import(pathToFileURL(path.join(ROOT, "api", f + ".js")).href + "?v=" + Math.random());
  const MAP = u => { const x = new URL(u, "http://x"), pth = x.pathname, q = x.searchParams; const set = o => { for (const [k, v] of Object.entries(o)) if (!q.has(k)) q.set(k, v); };
    const simple = { "/": "home", "/find": "buy", "/market-check": "marketCheck", "/sell": "sell", "/tasks": "tasksPage", "/about": "about", "/how-sam-decides": "howSamDecides", "/whats-new": "whatsNew", "/business": "business", "/feedback": "feedback", "/api/publicExamples": "publicExamples", "/api/track": "track" };
    if (simple[pth]) return [simple[pth], pth, q]; if (pth === "/terms" || pth === "/privacy") { set({ page: pth.slice(1) }); return ["legal", pth, q]; } if (pth === "/history") { set({ index: "1" }); return ["history", pth, q]; }
    let m = /^\/history\/([^/]+)\/([^/]+)$/.exec(pth); if (m) { set({ slug: m[1], vin: m[2] }); return ["history", pth, q]; } m = /^\/history\/([^/]+)$/.exec(pth); if (m) { set({ slug: m[1] }); return ["history", pth, q]; } return null; };
  const server = http.createServer(async (req, res) => { const m = MAP(req.url); if (!m) { res.statusCode = 404; return res.end("no"); }
    const out = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[String(k).toLowerCase()] = String(v); return this; }, getHeader(k) { return this.h[String(k).toLowerCase()]; }, removeHeader(k) { delete this.h[String(k).toLowerCase()]; }, writeHead(c, hh) { this.code = c; Object.assign(this.h, hh || {}); return this; }, status(c) { this.code = c; return this; }, send(b) { this.body = b == null ? "" : String(b); return this; }, end(b) { if (b != null) this.body = String(b); return this; }, json(o) { this.h["content-type"] = this.h["content-type"] || "application/json; charset=utf-8"; this.body = JSON.stringify(o); return this; } };
    const log = console.error; console.error = () => {}; try { await (await imp(m[0])).default({ method: "GET", url: m[1] + (m[2].toString() ? "?" + m[2].toString() : ""), query: Object.fromEntries(m[2]), headers: { host: "goasksam.com", ...req.headers }, socket: {} }, out); } catch (e) { out.code = 500; out.body = String(e && e.message); } finally { console.error = log; }
    res.writeHead(out.code, out.h); res.end(out.body); });
  await new Promise(r => server.listen(0, "127.0.0.1", r)); const base = "http://127.0.0.1:" + server.address().port;
  const runScenario = async (env, baseline) => { for (const k of ["NEW_DESIGN", "PUBLIC_EXAMPLES"]) delete process.env[k]; Object.assign(process.env, env); return visitorRun(base, baseline, realFetch); };
  process.env.PUBLIC_EXAMPLES = "1"; delete process.env.NEW_DESIGN; const baseline = await recordBaseline(base, realFetch);
  ok(Object.values(baseline.routes).some(r => r.status === 200 && /index/.test(r.robots)) && baseline.routes["/find"].design === "", "self-test: the baseline is today's pages (switch off): no X-Design, index pages present");
  const on = await runScenario({ NEW_DESIGN: "all", PUBLIC_EXAMPLES: "1" }, baseline); if (args.includes("--browser")) { const br = await visitorBrowser(base, { searches: false }); ok(br.fail === 0, `self-test: the visitor browser checks pass on this tree (${br.pass} passed, ${br.fail} failed)`); } ok(on.fail === 0, `self-test: this tree with the switch on and the examples on PASSES the visitor mode (${on.pass} passed, ${on.fail} failed)`);
  const off = await runScenario({ PUBLIC_EXAMPLES: "1" }, baseline); ok(off.fail > 0, `self-test: a head with the switch OFF (today's live head) FAILS the visitor mode (${off.fail} failed)`);
  const noex = await runScenario({ NEW_DESIGN: "all" }, baseline); ok(noex.fail > 0, `self-test: the switch on but no examples served FAILS the visitor mode (${noex.fail} failed)`);
  server.close(); console.log(`INFO visitor mode: switch on ${on.pass}/${on.pass + on.fail}, switch off ${off.fail} failures, examples off ${noex.fail} failures`);
  console.log(`goLiveLiveCheck self-test: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
}
// the crew look is only the flip seen early while the switch is OFF; with it on a crew fetch is the crew's own page (noindex), so it is never read as the public page
const switchOn = !SELF && (await get("/", false)).headers.get("x-design") === "new";
if (switchOn && !args.includes("--no-head")) { console.log("NOTE the switch is ON (the public page answers X-Design: new): a crew-cookie fetch is the crew's page, not the public one, so the look comparison is skipped. Run --visitor."); }
for (const p of args.includes("--no-head") || switchOn ? [] : ROUTES) {
  const pub = await get(p, false); if (pub.status !== 200) { console.log(`SKIP ${p}: the public page answers ${pub.status}`); continue; }
  const look = await get(p, true), pubHtml = await pub.text(), lookHtml = await look.text(), A = tags(pubHtml), Bt = tags(lookHtml);
  for (const [what, re] of PIECES) ok(re.test(pubHtml) === re.test(lookHtml), `${p}: ${what} is in the look exactly when the public page has it (public ${re.test(pubHtml)}, look ${re.test(lookHtml)})`);
  ok(look.status === 200 && look.headers.get("x-design") === "new", `${p}: the look serves the new page (status ${look.status}, X-Design ${look.headers.get("x-design")})`);
  for (const k of Object.keys(SHAPES)) ok(JSON.stringify(A[k]) === JSON.stringify(Bt[k]), `${p}: the look's ${k} is the public page's (${A[k].length} public, ${Bt[k].length} look${k === "robots" ? ": " + (A[k][0] || "none") + " vs " + (Bt[k][0] || "none") : ""})`);
}
if (BROWSER) {
  const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
  const open = async w => { const pg = await b.newPage(); await pg.setViewport({ width: w, height: 900 }); await pg.setExtraHTTPHeaders({ ...bypassH(), "x-vercel-set-bypass-cookie": "samesitenone" }); await pg.setCookie({ name: "gas_crew", value: CREW, domain: new URL(BASE).hostname, path: "/" }); const errs = []; pg.on("pageerror", e => errs.push(String(e.message).slice(0, 120))); pg.__errs = errs; return pg; };
  const settle = ms => new Promise(r => setTimeout(r, ms));
  try {
    for (const w of [1440, 390]) {   // Find results, signed out: the rail and the phone button
      const pg = await open(w); await pg.goto(BASE + "/find?q=Porsche%20911&design=new", { waitUntil: "domcontentloaded", timeout: 60000 }); await pg.waitForSelector("article.car", { timeout: 90000 }).catch(() => {}); { let last = -1, still = 0; for (let k = 0; k < 24 && still < 2; k++) { await settle(3000); const n = await pg.evaluate(() => document.querySelectorAll("article.car").length + (document.querySelectorAll("h1").length ? 1000 : 0)); still = n === last ? still + 1 : 0; last = n; } }   // the page draws its cards and its heading over about half a minute: wait until both stop changing
      const s = await pg.evaluate(() => ({ h1: document.querySelectorAll("h1").length, cards: document.querySelectorAll("article.car").length, rail: [...document.querySelectorAll(".rail")].map(r => r.textContent.replace(/\s+/g, " ").trim()).join(" | "), btn: !!document.querySelector("[data-mvisits]"), btnVisible: (() => { const e = document.querySelector("[data-mvisits]"); return !!e && e.getBoundingClientRect().width > 0; })(), overflow: document.documentElement.scrollWidth > innerWidth + 1, design: document.body.innerHTML.includes("gas-recent-list") }));
      ok(s.cards > 0 && s.h1 <= 1 && !s.overflow && pg.__errs.length === 0, `Find results @${w}: cards drawn, no more than one h1 (today's public results page has none, measured Nov 10), no horizontal overflow, no page errors (${s.cards} cards, ${s.h1} h1, overflow ${s.overflow}, ${pg.__errs.join("; ")})`);
      if (w === 1440) ok(/New search/i.test(s.rail) && /Recent searches/i.test(s.rail), `Find results @1440 signed out: the rail has New search and Recent searches (${s.rail.slice(0, 90)})`);
      else { ok(s.btnVisible, `Find results @390: the Your searches button is on screen`); if (s.btnVisible) { await pg.click("[data-mvisits]"); await settle(800); const open2 = await pg.evaluate(() => { const l = document.querySelector("#mvlist"); return !!l && l.getBoundingClientRect().height > 0 && getComputedStyle(l).display !== "none"; }); ok(open2, `Find results @390: the Your searches button opens the list`); } }
      await pg.close();
    }
    for (const w of [1440, 390]) {   // the Account button opens the sign in card; analytics and the banner
      const pg = await open(w); await pg.goto(BASE + "/?design=new", { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}); await settle(1500);
      const s = await pg.evaluate(() => ({ acct: !!document.querySelector("#acct, [data-account], .acct"), track: !!document.querySelector('script[src^="/api/track?js=1"]'), banner: !!document.getElementById("gas-consent-banner") || document.documentElement.innerHTML.includes("gasConsent") }));
      ok(s.acct, `Home @${w}: the Account button is there`);
      if (s.acct) { await pg.evaluate(() => (document.querySelector("#acct, [data-account], .acct") || {}).click && document.querySelector("#acct, [data-account], .acct").click()); await settle(1200); const card = await pg.evaluate(() => /Continue with Google|Email me a code|Sign in|email/i.test((document.querySelector(".gas-signin, #gas-signin, [id*=signin], [class*=signin]") || {}).textContent || "")); ok(card, `Home @${w}: the Account button opens the sign in card`); }
      await pg.close();
    }
    { const pg = await open(1440); await pg.goto(BASE + "/sell?design=new", { waitUntil: "domcontentloaded", timeout: 60000 }); await settle(3000);
      const typed = await pg.evaluate(() => { const i = document.querySelector("textarea, input[type=text], input:not([type])"); if (!i) return false; i.focus(); i.value = "2008 Porsche 911 Carrera"; i.dispatchEvent(new Event("input", { bubbles: true })); return true; });
      if (!typed) skip("Sell: no search box found to type in"); else { await pg.keyboard.press("Enter"); let r = { money: 0 }, steps = [];
        for (let k = 0; k < 14; k++) { await settle(5000); r = await pg.evaluate(() => ({ url: location.pathname + location.search, money: (document.body.innerText.match(/\$\d[\d,]+/g) || []).length, pick: /SAM'?S PICK/i.test(document.body.innerText) })); if (r.pick && r.money > 0) break;
          const c = await pg.evaluate(() => { const e = [...document.querySelectorAll("button.chip, .chip, .chips button, .qchips button, [data-chip], .opts button")].find(x => x.getBoundingClientRect().width > 0); if (!e) return null; const t = e.textContent.trim(); e.click(); return t; }); if (c) steps.push(c); }
        ok(r.pick && r.money > 0, `Sell @1440: a search answered through its questions (${steps.join(", ")}) reaches a result with Sam's pick (${r.url}, ${r.money} dollar figures)`); }
      await pg.close(); }
  } finally { await b.close(); }
  for (const m of ["sign in and sign out", "Find rail Recent, Saved, Before it ends signed in at 1440", "Your searches list with saved searches signed in at 390", "create and stop one Task, its criteria line equal to the list answer"]) skip(`${m}: needs a signed in account; the crew cookie is not one`);
}
console.log(`goLiveLiveCheck: ${pass} passed, ${fail} failed, ${notRun} not run`);
process.exit(fail ? 1 : 0);
