// goLiveLiveCheck (Lane E, Nov 10 2026): THE GO LIVE HEAD ON THE LIVE SITE, as a visitor would meet it after the flip, seen early through the crew look (?design=new with the signed crew cookie).
//   HEAD (no browser, read only, GET only): for every public route, the look's title, description, robots, canonical, Open Graph, Twitter and structured data equal the PUBLIC page's byte for byte, and the look answers X-Design: new.
//     This is the check that was missing when /sell?design=new carried noindex and /find?design=new answered today's page (Lane C, Nov 10).
//   BROWSER (--browser): the look at 1440 and 390: Find results and the rail, the Your searches button, the Account button opening the sign in card, the analytics script and the banner, one Sell search through to a result.
//   NOT RUN, said plainly: anything that needs a signed in ACCOUNT (the crew cookie is not an account).
// The crew cookie and the protection bypass are read from the Keychain (goasksam-crew, goasksam-bypass) in this process, never printed, written or put in an address. Run only in a gap, with no push lock open.
//   node scripts/goLiveLiveCheck.mjs [--browser] [--no-head] [BASE]
import path from "node:path"; import { createRequire } from "node:module"; import { execFileSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), ".."), args = process.argv.slice(2), BASE = args.find(a => /^https?:/.test(a)) || "https://goasksam.com", BROWSER = args.includes("--browser");
let pass = 0, fail = 0, notRun = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const skip = m => { notRun++; console.log("NOT RUN " + m); };
const { crewCookie } = await import(pathToFileURL(path.join(ROOT, "scripts/_crewCookie.mjs")).href);
const CREW = await crewCookie();
let BYP = ""; try { BYP = execFileSync("security", ["find-generic-password", "-s", "goasksam-bypass", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
if (!CREW) { console.log("REFUSED no crew cookie (Keychain goasksam-crew)"); process.exit(1); }
const bypassH = () => BYP ? { "x-vercel-protection-bypass": BYP } : {};
const get = (p, look) => fetch(BASE + p + (look ? (p.includes("?") ? "&" : "?") + "design=new" : ""), { redirect: "manual", headers: { ...bypassH(), ...(look ? { cookie: "gas_crew=" + CREW } : {}), "user-agent": "Mozilla/5.0 (goLiveLiveCheck)" } });
const META = n => new RegExp(`<meta\\b[^>]*\\bname=["']${n}["'][^>]*>`, "gi"), PROP = p => new RegExp(`<meta\\b[^>]*\\bproperty=["']${p}[^"']*["'][^>]*>`, "gi");
const SHAPES = { title: /<title\b[^>]*>[\s\S]*?<\/title>/gi, description: META("description"), robots: META("robots"), canonical: /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi, og: PROP("og:"), twitter: META("twitter:[^\"']*"), ld: /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi };
const tags = html => { const head = (/<head\b[\s\S]*?<\/head>/i.exec(html) || [html])[0], o = {}; for (const [k, re] of Object.entries(SHAPES)) o[k] = (k === "ld" ? html : head).match(re) || []; return o; };
const PIECES = [["the analytics script", /<script\b[^>]*\bsrc="\/api\/track\?js=1"/], ["the consent banner markup", /<div[^>]*gas-consent-banner/], ["the consent banner script", /<script>[^<]*(?:gasConsent|gas-consent-accept)/]];
const ROUTES = ["/", "/find", "/market-check", "/sell", "/tasks", "/about", "/how-sam-decides", "/whats-new", "/terms", "/privacy", "/business", "/feedback", "/history"];
for (const p of args.includes("--no-head") ? [] : ROUTES) {
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
