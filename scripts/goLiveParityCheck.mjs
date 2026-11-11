// goLiveParityCheck (Lane E, Nov 10 2026, go live Stages 2 and 4). For every route in scope, the CURRENT page (NEW_DESIGN off) against the NEW public page (NEW_DESIGN=all), same address:
//   HEAD       title, meta description, meta robots, canonical, Open Graph, Twitter and every JSON-LD block are the current page's, byte for byte (Sam's answer: only the h1 is the new design's).
//              Fails on a noindex the current page lacks, a missing canonical, a missing description, a "preview" title, lost structured data.
//   H1         the new page has exactly one non-empty h1; a site page (its <main> is the current page's own) keeps the current h1.
//   ADDRESSES  no crew preview address (/preview/...), preview title or preview marker in a public response.
//   LINKS      every internal link the current page has is in the new page (plus the new ones), unless it is in docs/go-live-held.json (listed for Sam, stops the go live).
//   SCRIPTS    every script the current page loads (sign in, analytics, results) is loaded by the new page, same rule.
//   CONTROLS   the search box, voice button and search button on the entry pages; the create button on Tasks; the form on Feedback.
// docs/go-live-held.json is the list of things the current page has that the new one lacks. The check passes with them listed, fails on a loss that is NOT listed and on a listed item that is no longer lost
// (a stale entry). With --ready it fails while that list has anything in it: that is the go live gate.
//   node scripts/goLiveParityCheck.mjs [--ready] [--print-held] [--mutants]
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), READY = args.includes("--ready"), PRINT = args.includes("--print-held");

if (args.includes("--mutants")) {
  const MUT = [
    ["a changed title", "lib/_publicHead.js", '["title", /<title\\b[^>]*>[\\s\\S]*?<\\/title>/gi],', ''],
    ["a missing canonical", "lib/_publicHead.js", '["canonical", /<link\\b[^>]*\\brel=["\']canonical["\'][^>]*>/gi],', ''],
    ["a missing description", "lib/_publicHead.js", '["description", META("description")],', ''],
    ["a noindex reaching the public", "lib/_publicHead.js", '["robots", META("robots")],', ''],
    ["lost structured data", "lib/_publicHead.js", '["ld", /<script\\b[^>]*\\btype=["\']application\\/ld\\+json["\'][^>]*>[\\s\\S]*?<\\/script>/gi]', '["ld", /(?!x)x/g]'],
    ["a preview address reaching the public", "lib/_publicHead.js", '  for (const [from, to] of ADDR) h = h.split(from).join(to);', ''],
    ["a dropped control (the voice button on Home)", "lib/preview/previewPages.js", 'aria-label="Speak your search"', 'aria-label="Talk"'],
    ["the sign in script missing", "lib/_publicHead.js", 'if (!/\\/auth\\.js/.test(h)) end.push(', 'if (false) end.push('],
    ["the banner waiting for the analytics tag (Home has the banner and no tag)", "lib/_publicHead.js", "if (L.includes(CONSENT_BANNER_HTML) && !h.includes(CONSENT_BANNER_HTML)) end.push(CONSENT_BANNER_HTML);\n  if (track && !TRACK_RE.test(h))", "if (track && L.includes(CONSENT_BANNER_HTML) && !h.includes(CONSENT_BANNER_HTML)) end.push(CONSENT_BANNER_HTML);\n  if (track && !TRACK_RE.test(h))"],
    ["Sell loading the analytics script with no consent choice", "lib/_publicHead.js", "if (track && !L.includes(CONSENT_BANNER_HTML) && !h.includes(CONSENT_BANNER_HTML)) {", "if (false) {"],
    ["the analytics script missing", "lib/_publicHead.js", 'if (track && !TRACK_RE.test(h)) end.push(track[0]);', ''],
    ["the consent banner missing", "lib/_publicHead.js", 'if (L.includes(CONSENT_BANNER_HTML) && !h.includes(CONSENT_BANNER_HTML)) end.push(CONSENT_BANNER_HTML);', ''],
    ["the Account button not opening the card", "lib/_publicHead.js", 'if (/id="acct"/.test(h)) end.push(', 'if (false) end.push('],
    ["How Sam decides out of the footer", "lib/preview/previewPages.js", '<a href="/how-sam-decides">${copyText("rail.FOOT_HOW")}</a>', ''],
    ["the crew look reading the page a crew cookie is handed (Sell's noindex)", "lib/_newDesign.js", "capture(handler, w.look ? asPublic(req) : req)", "capture(handler, req)"],
    ["the crew look keeping ?design=new in the address it reads (a query page is noindex)", "lib/_newDesign.js", 'u.searchParams.delete("design");', ""],
    ["a lost link (About in the footer)", "lib/preview/previewPages.js", '<a href="/about">', '<a href="/about-us">']
  ];
  let bad = 0;
  for (const [name, file, from, to] of MUT) {
    const f = path.join(ROOT, file), orig = fs.readFileSync(f, "utf8");
    if (!orig.includes(from)) { console.log("MUTANT NOT APPLICABLE (source changed): " + name); bad++; continue; }
    let code = 0;
    try { fs.writeFileSync(f, orig.split(from).join(to)); try { execFileSync("node", [fileURLToPath(import.meta.url)], { stdio: "pipe" }); } catch (e) { code = e.status || 1; } } finally { fs.writeFileSync(f, orig); }
    console.log((code ? "caught   " : "MISSED   ") + "without " + name); if (!code) bad++;
  }
  console.log(bad ? "goLiveParityCheck mutants: " + bad + " not caught" : "goLiveParityCheck mutants: all " + MUT.length + " caught");
  process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.LAUNCH_STAGE = "2"; delete process.env.CURTAIN_SEALED; delete process.env.NEW_DESIGN;
process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "k";
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [], text: async () => "[]", headers: { get: () => null } });
const origLog = console.log, origErr = console.error;
const quiet = async fn => { console.log = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = origLog; console.error = origErr; } };
// the tags are read by this check's OWN patterns, not by the code under test (a mutant of that code must not blind the check)
const TAGS = { title: /<title\b[^>]*>[\s\S]*?<\/title>/gi, description: /<meta\b[^>]*\bname=["']description["'][^>]*>/gi, robots: /<meta\b[^>]*\bname=["']robots["'][^>]*>/gi, canonical: /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi,
  og: /<meta\b[^>]*\bproperty=["']og:[^"']*["'][^>]*>/gi, twitter: /<meta\b[^>]*\bname=["']twitter:[^"']*["'][^>]*>/gi, ld: /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi };
const headTagsOf = html => { const s = String(html || ""), head = (/<head\b[\s\S]*?<\/head>/i.exec(s) || [s])[0], o = {}; for (const [k, re] of Object.entries(TAGS)) o[k] = (k === "ld" ? s : head).match(re) || []; return o; };
const mod = async f => (await import(pathToFileURL(path.join(ROOT, "api", f + ".js")).href)).default;

// [name, address, handler file, kind]: kind "landing" (the new design's own page, its h1 is its own), "site" (the current page's <main> carried over, same h1), "results" (the current page inside the new shell)
const ROUTES = [
  ["home", "/", "home", "landing"], ["find", "/find", "buy", "landing"], ["market-check", "/market-check", "marketCheck", "landing"], ["sell", "/sell", "sell", "landing"], ["sell (SELL_NEXT_ON=1, what production serves)", "/sell", "sell", "landing", { SELL_NEXT_ON: "1" }], ["tasks", "/tasks", "tasksPage", "landing"],
  ["market-check results", "/market-check?q=1995+bmw+m3", "marketCheck", "results"], ["find results", "/find?q=porsche+911", "buy", "results"],
  ["tasks-mine", "/tasks/mine?app=1", "tasksPage", "results"],
  ["business", "/business", "business", "site"], ["how", "/how-sam-decides", "howSamDecides", "site"], ["about", "/about", "about", "site"], ["whats-new", "/whats-new", "whatsNew", "site"],
  ["feedback", "/feedback", "feedback", "site"], ["terms", "/terms?page=terms", "legal", "site"], ["privacy", "/privacy?page=privacy", "legal", "site"]
];
async function get(handler, url, cookie) {
  const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[String(k).toLowerCase()] = String(v); return this; }, getHeader(k) { return this.h[String(k).toLowerCase()]; }, removeHeader() {}, writeHead(c) { this.code = c; return this; }, status(c) { this.code = c; return this; }, send(b) { this.body = b == null ? "" : String(b); return this; }, end(b) { if (b != null) this.body = String(b); return this; }, json(o) { this.body = JSON.stringify(o); return this; } };
  const u = new URL(url, "https://goasksam.com");
  await quiet(() => handler({ method: "GET", url, query: Object.fromEntries(u.searchParams), headers: { host: "goasksam.com", ...(cookie ? { cookie } : {}) }, socket: {} }, res).catch(() => {}));
  return res;
}
const strip = h => String(h).replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");
const linksOf = h => { const o = new Set(); for (const m of strip(h).matchAll(/<a\b[^>]*\bhref="([^"#]+)/gi)) { let x = m[1].replace(/&amp;/g, "&"); if (/^https?:\/\/(www\.)?goasksam\.com/.test(x)) x = x.replace(/^https?:\/\/[^/]+/, ""); if (x.startsWith("/") && !/[+']/.test(x)) o.add(x.split("?")[0]); } return o; };
// a script is named by its file, not by the cache-busting folder in front of it (/js.20261026e/auth.js is /js/auth.js)
const normScript = x => x.replace(/^\/?(?:js|obx|dsk)\.[0-9]+[a-z]?\//, "/js/").replace(/^js\//, "/js/");
const scriptsOf = h => new Set([...String(h).matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)].map(m => normScript(m[1])));
// FOR LANE C'S LIVE RENDER, not held for Sam (Sam's answer, Nov 10): the Sell landing's wizard scripts (the new Sell entry opens today's Sell results, which load them) and Market Check's results script (the new entry hands the search to today's results page, which loads it). The live render must show a search from each entry reaching a working results page.
const LIVE_RENDER = { sell: /^\/js\/(wizard|pipeline|steps|result|chat-core|result-copy|result-v2|entry|homepage|onebox)\.js$/, "market-check": /^\/js\/onebox\.js$/ };
const h1Of = h => { const m = [...strip(h).matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(x => x[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()); return m; };
const held = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "docs/go-live-held.json"), "utf8")); } catch { return []; } })();
const lost = [];   // { route, kind, item }
// the address the handler sees for a crew cookie: vercel.json rewrites each public address, for a crew cookie, to its handler WITH added parameters (_crew=1, and the route's own, such as app=1); ?design=new rides along. Read from vercel.json, never typed.
const VJ = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const lookUrl = url => { const u = new URL(url, "https://goasksam.com"), rule = (VJ.rewrites || []).find(r => r.source === u.pathname && (r.has || []).some(x => x.type === "cookie" && x.key === "gas_crew")); if (rule) for (const [k, v] of new URL(rule.destination, "https://x").searchParams) if (!u.searchParams.has(k)) u.searchParams.set(k, v); u.searchParams.set("design", "new"); return u.pathname + u.search; };
process.env.CURTAIN_CREW_CODE = "go-live-parity"; const CREW_COOKIE = "gas_crew=" + (await import(pathToFileURL(path.join(ROOT, "lib/_crew.js")).href)).mintCrewCookieValue();

for (const [name, url, f, kind, envx] of ROUTES) {
  const h = await mod(f); delete process.env.SELL_NEXT_ON; Object.assign(process.env, envx || {});
  delete process.env.NEW_DESIGN; const A = await get(h, url); process.env.NEW_DESIGN = "all"; const B = await get(h, url); delete process.env.NEW_DESIGN;
  if (A.code !== 200) { ok(B.code === A.code, `${name}: today answers ${A.code}, the new answers ${B.code}`); continue; }
  // THE CREW LOOK IS THE FLIP, SEEN EARLY (Lane C's live render, Nov 10: Sell's look carried noindex, nofollow where the public Sell is index, follow, because the look read the Sell a crew cookie is handed, not the Sell a visitor gets): with the switch OFF, the crew cookie plus ?design=new must carry the head of the PUBLIC page on EVERY route: title, description, robots, canonical, og, twitter, structured data.
  { const C = await get(h, lookUrl(url), CREW_COOKIE), ca = headTagsOf(A.body), cb = headTagsOf(C.body);
    if (C.h["x-design"] === "new") for (const k of ["title", "description", "robots", "canonical", "og", "twitter", "ld"]) ok(JSON.stringify(ca[k]) === JSON.stringify(cb[k]), `${name} ${url}: the crew look's ${k} is the PUBLIC page's, byte for byte (${ca[k].length} public, ${cb[k].length} look)`);
    else ok(false, `${name} ${url}: the crew look serves the new page (X-Design: new)`); }
  ok(B.h["x-design"] === "new", `${name}: the new page is served (X-Design: new)`);
  if (B.h["x-design"] !== "new") continue;
  const a = headTagsOf(A.body), b = headTagsOf(B.body), t = `${name} ${url}`;
  for (const k of ["title", "description", "robots", "canonical", "og", "twitter", "ld"]) ok(JSON.stringify(a[k]) === JSON.stringify(b[k]), `${t}: ${k} is the current page's, byte for byte (${a[k].length} today, ${b[k].length} new)`);
  ok(!/preview/i.test((b.title[0] || "")), `${t}: no preview title`);
  ok(!b.robots.some(r => /noindex/i.test(r)) || a.robots.some(r => /noindex/i.test(r)), `${t}: no noindex the current page does not have`);
  if (a.canonical.length) ok(b.canonical.length === 1, `${t}: the canonical is there`);
  if (a.description.length) ok(b.description.length === 1, `${t}: the description is there`);
  ok(b.ld.length >= a.ld.length, `${t}: structured data kept (${a.ld.length} blocks today, ${b.ld.length} new)`);
  ok(B.h["x-robots-tag"] === A.h["x-robots-tag"] && B.h["cache-control"] === A.h["cache-control"], `${t}: robots and cache headers are today's`);
  // addresses
  ok(!/["'(=]\s*\/preview(\/|\?|["'])[a-z-]*/.test(B.body.replace(/indexOf\("\/preview\/"\)/g, "")) || /indexOf\("\/preview\/"\)/.test(B.body) && !/(href|src|action)="\/preview/.test(B.body) && !/fetch\("\/preview/.test(B.body), `${t}: no crew preview address in a public response`);
  ok(!/GoAskSam preview|class="gas-preview|data-gas-preview/i.test(B.body), `${t}: no preview marker in a public response`);
  // h1
  const ha = h1Of(A.body), hb = h1Of(B.body), noidx = a.robots.some(r => /noindex/i.test(r));   // a noindex page (the Tasks app) has no search h1 to keep
  if (!noidx) {
  if (ha.length || kind !== "results") ok(hb.length === 1 && hb[0].length > 2, `${t}: exactly one non-empty h1 in the new page (${JSON.stringify(hb)})`);
  if (kind === "site") ok(hb[0] === ha[0] || ha.length === 0 || hb.includes(ha[0]), `${t}: the h1 is the current page's (${ha[0] || "none"})`);
  }
  // links and scripts
  const la = linksOf(A.body), lb = linksOf(B.body), sa = scriptsOf(A.body), sb = scriptsOf(B.body);
  for (const x of la) if (!lb.has(x)) lost.push({ route: name, kind: "link", item: x });
  for (const x of sa) if (!sb.has(x) && !(LIVE_RENDER[name.split(" ")[0]] && LIVE_RENDER[name.split(" ")[0]].test(x))) lost.push({ route: name, kind: "script", item: x });
  // THE FOOTER: How Sam decides, in the footer of the new page, as a link like the others (go live held item 1)
  { const ft = /<footer\b[\s\S]*?<\/footer>/i.exec(B.body); const fl = ft ? [...ft[0].matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map(m => [m[1], m[2].trim()]) : [];
    ok(fl.some(x => x[0] === "/how-sam-decides" && x[1] === "How Sam decides"), `${t}: the footer links How Sam decides (${fl.map(x => x[1]).join(", ")})`);
    if (name === "home") ok(fl.length >= 6, `${t}: the footer link sits among the others (${fl.length} links)`); }
  // SIGN IN (go live held item 2): wherever the current page loads the sign in script, the new page loads it, has the bar's container, and the Account button opens the same card
  if (sa.size && [...sa].some(x => /\/js\/auth\.js$/.test(x))) {
    ok([...sb].some(x => /\/js\/auth\.js$/.test(x)), `${t}: the sign in script is loaded`);
    ok(/id="signin-area"/.test(B.body) && /GAS_AUTH_MODE="topbar"/.test(B.body), `${t}: the sign in bar's container is in the page and the script runs in top bar mode`);
    ok(!/id="acct"/.test(B.body) || (/openSignInCard\(\)/.test(B.body) && !/dest:"\/tasks/.test(B.body)), `${t}: the Account button opens the sign in card and names no destination of its own (the card remembers this page)`);
    ok(!/id="acct"/.test(B.body) || (/id="acct-menu"/.test(B.body) && /class="acct-out"/.test(B.body)), `${t}: the Account button has its account menu (the address and Sign out)`);
    ok(/\.gas-signbar,\.gas-signbar-m\{display:none!important\}/.test(B.body), `${t}: the sign in strip is never shown (the header's Account menu replaces it)`);
  }
  // ANALYTICS AND THE CONSENT BANNER (go live held item 3): exactly the pieces the current page carries, each on its own, and none it does not. The banner, its script and the outbound tagging are NOT tied to the /api/track?js=1 tag: Home, Feedback and the legal pages carry the banner without it (Lane C's live read, Nov 10; the first version of this check only looked when the tag was there, so those pages were never read)
  {
    const has = (body, re) => re.test(body), inl = body => [...body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    const pieces = [["the analytics script", /<script\b[^>]*\bsrc="\/api\/track\?js=1"/], ["the consent banner markup", /id="gas-consent-banner"/], ["the consent banner script", /gasConsent|gas-consent-banner/]];
    for (const [what, re] of pieces) {
      const inA = what === "the consent banner script" ? inl(A.body).some(x => re.test(x)) : has(A.body, re), inB = what === "the consent banner script" ? inl(B.body).some(x => re.test(x)) : has(B.body, re);
      // a page that loads the analytics script offers the consent choice (Sell with SELL_NEXT_ON=1 loads it and had no banner: the new page gives it the shared one); a page that loads neither gets neither
      const trackA = has(A.body, pieces[0][1]), want = /banner/.test(what) ? inA || trackA : inA;
      ok(want === inB, `${t}: ${what} is in the new page exactly when the current page has it, or loads the analytics script (today ${inA}, analytics script ${trackA}, new ${inB})`);
    }
    const oA = inl(A.body).filter(x => /gasOutboundInstall\(/.test(x)), oB = new Set(inl(B.body));
    ok(oA.every(x => oB.has(x)), `${t}: the outbound tagging scripts are loaded as today (${oA.length})`);
    const inlineA = inl(A.body).filter(x => /gasConsent|gas-consent-banner/.test(x)); ok(inlineA.every(x => oB.has(x)), `${t}: every consent script of the current page is in the new page (${inlineA.length})`);
  }
  // controls
  if (["home", "find", "market-check", "sell"].includes(name)) {
    const s = strip(B.body);
    ok(/<(textarea|input)\b[^>]*(id="[^"]*(q|input|inp)[^"]*"|placeholder)/i.test(s), `${t}: a search box`);
    ok(/<button\b[^>]*aria-label="Speak[^"]*"/.test(s), `${t}: the voice button`);
    ok(/<button\b[^>]*type="submit"/.test(s) || /<button\b[^>]*aria-label="Go ask Sam"/.test(s) || /<button\b[^>]*id="[^"]*(go|btn)"/.test(s), `${t}: the search button`);
  }
  if (name === "tasks") ok(/<button\b[^>]*id="tkcta/.test(B.body) || /Start a Task|Tell Sam/.test(strip(B.body)), `${t}: the create control`);
  if (name === "feedback") { const s = strip(B.body); ok(/<form\b/.test(s) && /<textarea\b/.test(s) && /<button\b/.test(s), `${t}: the feedback form`); }
}
delete process.env.SELL_NEXT_ON;
// HELD list against what is lost
const key = x => `${x.route}|${x.kind}|${x.item}`, heldKeys = new Set(held.map(key)), lostKeys = new Set(lost.map(key));
if (PRINT) { fs.writeFileSync(path.join(ROOT, "docs/go-live-held.json"), JSON.stringify(lost.map(x => ({ ...x, note: "" })), null, 1) + "\n"); origLog("wrote docs/go-live-held.json with " + lost.length + " items"); process.exit(0); }
for (const x of lost) ok(heldKeys.has(key(x)), `${x.route}: the current page's ${x.kind} ${x.item} is missing from the new page and is not listed in docs/go-live-held.json (list it for Sam, or restore it)`);
for (const x of held) ok(lostKeys.has(key(x)), `docs/go-live-held.json lists ${x.route} ${x.kind} ${x.item}, which the new page now has: take it off the list`);
if (READY) ok(held.length === 0, `GO LIVE GATE: ${held.length} item(s) the current pages have and the new ones lack are still open in docs/go-live-held.json`);
console.log(`goLiveParityCheck: ${pass} passed, ${fail} failed (${held.length} held for Sam${READY ? ", gate on" : ""})`);
process.exit(fail ? 1 : 0);
