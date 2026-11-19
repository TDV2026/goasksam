// tasksStartControlCheck: THE SIGNED OUT /tasks PAGE HAS A WORKING WAY TO START, and the live sign-in check clicks controls that exist.
// CAUSE it covers (Lane S, Nov 16 2026): scripts/tasksAuthCheck.mjs clicked #tkcta2 and #tkcta, the "Give Sam a Task" buttons of the page NEW_DESIGN replaced on Nov 11; the new /tasks page starts from the request box
// (#pq and its submit button) and the header's Account button, and nothing failed loudly because that check only runs live. This check runs offline in headless Chrome on the page the new design serves
// (api/tasksPage.js with NEW_DESIGN on, the door the live site runs) with the real public/js/auth.js and the network answered by fixtures:
//   1 the request box, its submit button and the header Account button are on the page, at 1440 and 390
//   2 typing a request and pressing the submit button opens the sign-in card, styled and in view, carrying the typed words in the destination (/tasks/mine?start=1&words=...)
//   3 the header's Account button opens the same card
//   4 CLASS: every selector scripts/tasksAuthCheck.mjs and scripts/signinReturnCheck.mjs (its new-design half) use on /tasks exists in the served page, and neither names a button the page does not have
// MUTANTS (--mutants): the request box gone, the submit button gone, the page script's sign-in call gone, the header sign-in script gone, the live check back on #tkcta2.
//   node scripts/tasksStartControlCheck.mjs [--mutants]
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL, fileURLToPath } from "node:url";
process.env.LAUNCH_STAGE = "2"; process.env.NEW_DESIGN = "1";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const puppeteer = (await import(pathToFileURL(path.join(ROOT, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).href).catch(() => import("puppeteer-core"))).default;
const render = async (mod, url, query = {}) => { const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", mod + ".js")).href + "?t=" + Date.now());
  return await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(b) { r(String(b)); return res; }, end(b) { r(String(b || "")); return res; }, json(o) { r(JSON.stringify(o)); return res; } }; Promise.resolve(h({ method: "GET", url, query, headers: { host: "goasksam.com", cookie: "" } }, res)).catch(() => r("")); }); };
const LIVE = fs.readFileSync(path.join(ROOT, "scripts/tasksAuthCheck.mjs"), "utf8");
const mime = f => f.endsWith(".js") ? "application/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".woff2") ? "font/woff2" : "application/octet-stream";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL  " + m); } };

// the selectors the live check starts from, read from its own source so a rename there is read here
const sel = name => (LIVE.match(new RegExp(name + '\\s*=\\s*"([^"]+)"')) || [])[1];
function run(html, liveSrc) {
  const out = { start: sel0(liveSrc, "START_BOX"), go: sel0(liveSrc, "START_GO"), head: sel0(liveSrc, "HEADER_SIGNIN"), dead: [...liveSrc.matchAll(/["'`](#tkcta2?)["'`]/g)].map(m => m[1]) };
  return out;
}
const sel0 = (src, name) => (src.match(new RegExp(name + '\\s*=\\s*"([^"]+)"')) || [])[1];

async function evaluate(html, liveSrc) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const res = [];
  try {
    const S = run(html, liveSrc);
    for (const w of [1440, 390]) {
      const ctx = await (b.createBrowserContext ? b.createBrowserContext() : b.createIncognitoBrowserContext()); const p = await ctx.newPage(); await p.setViewport({ width: w, height: 900 });
      await p.setRequestInterception(true);
      p.on("request", r => {
        const u = new URL(r.url()), CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }, j = o => r.respond({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify(o) });
        if (r.method() === "OPTIONS") return r.respond({ status: 204, headers: CORS, body: "" });
        if (r.isNavigationRequest() && u.origin === "https://goasksam.com") return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: html });
        if (u.pathname === "/api/publicConfig") return j({ supabaseUrl: "https://sb.test", anonKey: "anon" });
        if (u.host === "goasksam.com") { const rel = u.pathname.replace(/^\/(js|obx)\.[0-9a-z]+\//, "/js/"); const f = path.join(ROOT, "public", rel); if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.respond({ status: 200, contentType: mime(f), body: fs.readFileSync(f) }); }
        return r.respond({ status: 204, body: "" });
      });
      await p.goto("https://goasksam.com/tasks", { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 900));
      const there = await p.evaluate((a, g, h) => ({ box: !!document.querySelector(a), go: !!document.querySelector(g), head: [...document.querySelectorAll(h)].some(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; }) }), S.start || "#__none", S.go || "#__none", S.head || "#__none");
      const card = async () => p.evaluate(() => { const d = document.querySelector("#auth-modal .auth-dialog"); if (!d) return null; const r = d.getBoundingClientRect(); return { inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, email: !!document.querySelector("#auth-email"), text: d.innerText.slice(0, 160) }; });
      let c1 = null, dest = null;
      if (there.box && there.go) { await p.type(S.start, "a red manual Porsche 911"); await p.click(S.go); await new Promise(r => setTimeout(r, 500)); c1 = await card(); }
      if (c1) dest = await p.evaluate(() => { try { return Object.keys(localStorage).filter(k => /return/i.test(k)).map(k => localStorage.getItem(k)).join(" "); } catch (e) { return ""; } });
      await p.evaluate(() => { const m = document.getElementById("auth-modal"); if (m) m.remove(); });
      let c2 = null; if (there.head) { await p.evaluate(h => { const e = [...document.querySelectorAll(h)].find(e => e.getBoundingClientRect().width > 0); e && e.click(); }, S.head); await new Promise(r => setTimeout(r, 500)); c2 = await card(); }
      res.push({ w, there, c1, c2, dest, S }); await ctx.close();
    }
  } finally { await b.close(); }
  return res;
}
function judge(label, res, html, liveSrc) {
  const n0 = fail;
  for (const r of res) {
    ok(r.there.box && r.there.go, `${label} ${r.w}px: the request box (${r.S.start}) and its submit button (${r.S.go}) the live check uses are on the page`);
    ok(r.there.head, `${label} ${r.w}px: the header Account button (${r.S.head}) the live check uses is on the page`);
    ok(!!r.c1 && r.c1.inView && r.c1.email, `${label} ${r.w}px: typing a request and pressing submit opens the sign-in card in view, with the email field :: ${JSON.stringify(r.c1)}`);
    ok(!!r.c1 && /\/tasks\/mine\?start=1&words=a%20red%20manual/.test(String(r.dest || "")), `${label} ${r.w}px: the sign-in card keeps the destination /tasks/mine?start=1 with the typed words :: ${r.dest}`);
    ok(!!r.c2 && r.c2.inView, `${label} ${r.w}px: the header Account button opens the same card :: ${JSON.stringify(r.c2)}`);
  }
  const dead = [...liveSrc.matchAll(/(?:click|type|waitForSelector)\(\s*["'`](#tkcta2?)["'`]/g)].map(m => m[1]);
  ok(dead.length === 0, `${label}: scripts/tasksAuthCheck.mjs does not click a button the page does not have (${dead.join(", ")})`);
  return fail === n0;
}

const base = await render("tasksPage", "/tasks");
ok(/id="pq-form"/.test(base) && /id="pq"/.test(base) && /class="go" type="submit"/.test(base), "the served page has the request form, the box and a submit button");
ok(!/id="tkcta2?"/.test(base), "the served page has no #tkcta or #tkcta2 (the old buttons), so no check may name them");
const res = await evaluate(base, LIVE); judge("page", res, base, LIVE);
console.log(`tasksStartControlCheck: ${pass} pass, ${fail} FAIL`);
if (!process.argv.includes("--mutants")) process.exit(fail ? 1 : 0);

// MUTANTS: each must make the check FAIL on its own
const mutants = [
  ["the request box gone", base.replace(/<textarea id="pq"[^>]*><\/textarea>/, ""), LIVE],
  ["the submit button gone", base.replace(/<button class="go" type="submit"[^>]*>[\s\S]*?<\/button>/, ""), LIVE],
  ["the page script no longer opens the sign-in card", base.replace(/openSignInCard\(/g, "void("), LIVE],
  ["the header sign-in script gone", base.replace('<script src="/js/auth.js" defer></script>', ""), LIVE],
  ["the header Account button gone", base.replace(/<a\b[^>]*\bid="acct"[^>]*>[^<]*<\/a>/, ""), LIVE],
  ["the live check back on #tkcta2", base, LIVE.replace('const started = await startFromBox(p);', 'const started = !!(await p.click("#tkcta2").then(() => true).catch(() => false));')],
];
let missed = 0;
for (const [name, html, src] of mutants) {
  const before = fail; const r = await evaluate(html, src); judge("mutant", r, html, src);
  const caught = fail > before; if (!caught) { missed++; console.log("MISSED mutant: " + name); } else console.log("caught: " + name);
  fail = before;   // mutants are expected to fail; do not count them
}
console.log(`mutants: ${mutants.length - missed} of ${mutants.length} caught`);
process.exit(fail || missed ? 1 : 0);
