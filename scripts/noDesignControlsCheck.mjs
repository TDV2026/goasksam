// NO PAGE CARRIES A DESIGN TEST CONTROL (Sam, Oct 28 2026). Cause: the palette switcher (eight colourways, a stored choice read on EVERY page by an apply script, eight inert palettes' CSS) was built for the crew to choose a look; the choice is made (A Current),
// but the code stayed on every page as crew-only markup plus a public-page script that read a stored choice. Class: any control, script, stored value or query string that lets someone change how a page LOOKS. This reads every page handler (as the public and as the
// crew), every static page and every served script for the controls in scripts/e98DesignControls.mjs, and renders a page in Chrome with palette H stored to prove it draws the same colours as with nothing stored.   node scripts/noDesignControlsCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DESIGN_CONTROLS, designControlProblems } from "./e98DesignControls.mjs";
import { startBrowser, openMC, pageHtml, ROOT } from "./e98Render.mjs";
import { MC } from "./e98Fixtures.mjs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
// 1. every page handler, as the public and as the crew
const PAGES = [["api/home.js", "/"], ["api/buy.js", "/buy"], ["api/marketCheck.js", "/market-check"], ["api/sellPage.js", "/sell"], ["api/tasksPage.js", "/tasks"], ["api/tasksPage.js", "/tasks/mine"], ["api/business.js", "/business"], ["api/howSamDecides.js", "/how-sam-decides"], ["api/about.js", "/about"], ["api/feedback.js", "/feedback"], ["api/legal.js", "/privacy"], ["api/sellNext.js", "/sell/next"]];
process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "x"; globalThis.fetch = async () => { throw new Error("no network"); };
let read = 0;
for (const [file, url] of PAGES) for (const crew of [false, true]) {
  let html = ""; try { html = await pageHtml(file, url, crew); } catch { html = ""; }
  if (html.length < 500) continue; read++;
  const bad = designControlProblems(html, `${url} as ${crew ? "the crew" : "the public"}`);
  ok(!bad.length, `${url} as ${crew ? "the crew" : "the public"}: no design test control${bad.length ? " (" + bad.join("; ") + ")" : ""}`);
}
ok(read >= 10, `${read} page renders were read (at least 10: five pages as public and as crew)`);
// 2. every static page and every served script
const files = []; const walk = d => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = d + "/" + e.name; if (e.isDirectory()) { if (!/fonts|img/.test(p)) walk(p); } else if (/\.(html|js|css)$/.test(e.name)) files.push(p); } };
walk("public");
const GATED = new Set();   // nothing is exempt: a preview page in public/ is served to anyone who asks for its path, so there is none (see 2b)
let scanned = 0;
for (const f of files) { if (GATED.has(f)) continue; scanned++; const src = fs.readFileSync(path.join(ROOT, f), "utf8"), code = /\.js$/.test(f) ? src.split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n") : src, bad = designControlProblems(code, f); ok(!bad.length, `${f}: no design test control${bad.length ? " (" + bad.join("; ") + ")" : ""}`); }
ok(scanned > 15, `${scanned} static files were read`);
// 2b. NO PREVIEW OR TEST PAGE IN public/ (Sam, Oct 28 2026). Vercel serves any file in public/ to anyone who asks for its path, so a page gated by a script inside it is not gated. Every .html in public/ is a real page or is redirected away; the crew-only pages
// (the design preview, the Desk) live in lib/crewPages/ and are sent by api/crewPage.js to the signed crew cookie only, with a disguised 404 for everyone else.
{ const vj = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")), REAL = new Set(["mcp.html", "powersellers.html", "onebox.html", "sell-old.html"]), htmls = fs.readdirSync(path.join(ROOT, "public")).filter(n => /\.html$/.test(n));
  ok(htmls.every(n => REAL.has(n)), `public/ holds only the real pages and templates (${htmls.join(", ")}); an unlisted .html there is a page anyone can open`);
  const redirected = src => (vj.redirects || []).some(r => r.source === src && /^\/(?:sell|market-check)$/.test(r.destination));
  ok(redirected("/onebox.html") && redirected("/sell-old.html"), "the Market Check template (/onebox.html) and the old Sell page (/sell-old.html) are redirected away before the file is served");
  const dest = src => (vj.rewrites || []).filter(r => r.source === src).map(r => r.destination);
  ok(dest("/onebox-preview").every(d => /^\/api\/crewPage\?page=onebox-preview$/.test(d)) && dest("/onebox-preview").length === 1 && dest("/desk").length >= 1 && dest("/desk").every(d => /^\/api\/crewPage\?page=desk$/.test(d)), "/onebox-preview and /desk are rewritten to api/crewPage only (never to a file in public/)");
  ok(fs.existsSync(path.join(ROOT, "lib/crewPages/onebox-preview.html")) && fs.existsSync(path.join(ROOT, "lib/crewPages/desk.html")) && !fs.existsSync(path.join(ROOT, "public/onebox-preview.html")) && !fs.existsSync(path.join(ROOT, "public/desk.html")), "the preview and the Desk page are not files in public/");
  ok(JSON.stringify((vj.functions || {})["api/crewPage.js"] || {}).includes("lib/crewPages"), "vercel.json ships lib/crewPages with api/crewPage.js");
  let crewPage = null; try { crewPage = (await import(pathToFileURL(path.join(ROOT, "api/crewPage.js")).href)).default; } catch { ok(false, "api/crewPage.js (the server gate for the crew-only pages) does not exist"); }
  const { crewCookie } = await import(pathToFileURL(path.join(ROOT, "scripts/e98Render.mjs")).href);
  const call = (page, cookie) => new Promise(r => { const res = { code: 200, h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, send(b) { r({ code: this.code, body: String(b), h: this.h }); return this; } }; crewPage({ method: "GET", url: "/api/crewPage?page=" + page, query: { page }, headers: { host: "goasksam.com", cookie } }, res); });
  const crewC = await crewCookie();
  if (crewPage) for (const pg of ["onebox-preview", "desk"]) { const pub = await call(pg, ""), crew = await call(pg, crewC), bad = await call(pg, "gas_crew=ok");
    ok(pub.code === 404 && !/preview|Desk|desk/i.test(pub.body.replace(/<[^>]+>/g, " ")) , `${pg}: the public gets a 404 with nothing of the page (${pub.code})`);
    ok(bad.code === 404, `${pg}: a forged or plain crew cookie gets the 404 (${bad.code})`);
    ok(crew.code === 200 && crew.body.length > 5000 && /noindex/.test(crew.h["X-Robots-Tag"] || ""), `${pg}: the signed crew cookie gets the page, noindex (${crew.code}, ${crew.body.length} bytes)`); }
  if (crewPage) { const unk = await call("nothing", crewC); ok(unk.code === 404, "an unknown crew page is a 404 even for the crew"); } }
// 2c. THE DESK'S DOTS MODE IS UNREACHABLE FROM ANY PUBLIC PAGE (Sam's rule: never show dots; the code stays for after launch). The only page that loads desk.js is the crew-only Desk page; no other page, template or script names it; its data comes from api/desk.js, a disguised 404 without the crew cookie.
{ const hits = [], walkAll = d => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = d + "/" + e.name; if (e.isDirectory()) { if (!/node_modules|fonts|img|docs|proofs/.test(p)) walkAll(p); } else if (/\.(js|html)$/.test(e.name) && p !== "public/js/desk.js" && p !== "lib/crewPages/desk.html" && p !== "api/crewPage.js" && !/^lib\/desk\//.test(p) && p !== "api/desk.js") { const src = fs.readFileSync(path.join(ROOT, p), "utf8").split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n"); if (/\/dsk\.[\w.]+\/desk\.js|["'\/]js\/desk\.js|src=["'][^"']*desk\.js/.test(src)) hits.push(p); } } };
  for (const d of ["api", "lib", "public"]) walkAll(d);
  ok(!hits.length, "no page, template or script loads desk.js (its dots mode) except the crew-only Desk page" + (hits.length ? " (" + hits.join(", ") + ")" : ""));
  ok(/sendDisguisedNotFound/.test(fs.readFileSync(path.join(ROOT, "api/desk.js"), "utf8")), "the Desk's data endpoint (api/desk.js) answers a disguised 404 without the crew cookie");
  ok(/desk\.js/.test(fs.readFileSync(path.join(ROOT, "lib/crewPages/desk.html"), "utf8")), "desk.js is loaded by the Desk page, which is in lib/crewPages (crew only)"); }
// 3. the shared shell and the page code themselves (the markup is made there)
for (const f of ["lib/appShell.js", "api/home.js", "api/buy.js", "api/marketCheck.js", "api/sellPage.js", "api/tasksPage.js", "api/business.js"]) { const bad = designControlProblems(fs.readFileSync(path.join(ROOT, f), "utf8").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n"), f); ok(!bad.length, `${f}: no design test control in the code${bad.length ? " (" + bad.join("; ") + ")" : ""}`); }
// 4. a browser that had palette H stored renders A: the same computed colours as one with nothing stored, on the public page and as the crew
const b = await startBrowser();
const fx = MC["2001 BMW M3 (alike with options)"], probe = () => { const g = s => getComputedStyle(document.querySelector(s)).backgroundColor, c = s => getComputedStyle(document.querySelector(s)).color; return [g("body"), g("#ob-go, .go, button.go"), c("h1"), document.documentElement.getAttribute("data-pal") || "none", g(".sfc-card"), c(".sfc-range")].join(" | "); };
for (const crew of [false, true]) for (const w of [390, 1440]) {
  const plain = await openMC(b, fx, w, { crew }), withH = await openMC(b, fx, w, { crew, storage: { "gas-pal": "h", "gas_cardv2": "0" } });
  const a = await plain.evaluate(probe), h = await withH.evaluate(probe);
  ok(a === h && h.split(" | ")[3] === "none", `${crew ? "crew" : "public"} at ${w}: a browser with palette H stored draws exactly the colours of one with nothing stored (${h})`);
  await plain.close(); await withH.close();
}
await b.close();
console.log(`noDesignControlsCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
