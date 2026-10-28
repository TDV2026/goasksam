// NO PAGE CARRIES A DESIGN TEST CONTROL (Sam, Oct 28 2026). Cause: the palette switcher (eight colourways, a stored choice read on EVERY page by an apply script, eight inert palettes' CSS) was built for the crew to choose a look; the choice is made (A Current),
// but the code stayed on every page as crew-only markup plus a public-page script that read a stored choice. Class: any control, script, stored value or query string that lets someone change how a page LOOKS. This reads every page handler (as the public and as the
// crew), every static page and every served script for the controls in scripts/e98DesignControls.mjs, and renders a page in Chrome with palette H stored to prove it draws the same colours as with nothing stored.   node scripts/noDesignControlsCheck.mjs
import fs from "node:fs";
import path from "node:path";
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
const GATED = new Set(["public/onebox-preview.html"]);   // a design preview page: noindex, and its own first script sends anyone without the crew or tester cookie to / (listed for Sam, not a public page)
let scanned = 0;
for (const f of files) { if (GATED.has(f)) continue; scanned++; const src = fs.readFileSync(path.join(ROOT, f), "utf8"), code = /\.js$/.test(f) ? src.split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n") : src, bad = designControlProblems(code, f); ok(!bad.length, `${f}: no design test control${bad.length ? " (" + bad.join("; ") + ")" : ""}`); }
ok(scanned > 15, `${scanned} static files were read`);
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
