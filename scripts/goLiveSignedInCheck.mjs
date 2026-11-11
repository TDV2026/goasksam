// goLiveSignedInCheck (Lane E, Nov 11 2026): THE NEW DESIGN AS A VISITOR AND SIGNED IN SEES IT, measured on the rendered screen, with sign in stubbed (no network, no account, no mailbox).
// CAUSES. (1) THE RAIL: Find's results page had no left rail for anyone: a stray "$1" in lib/preview/mcSellPreview.js (a function replacer that returned the text "$1" instead of the shell's <div class="mshell">) deleted the grid wrapper, so the rail fell back to the old drawer rules: a full width dark "New search" bar. The crew preview of Find is the LANDING (no results page, no rail), so it never ran that line, and every earlier check read the DOM (the element was there) or the page's text, not the screen.
//   AFFECTS the Find results page, signed out and signed in (its Saved searches and Before it ends are drawn into the same rail); Market Check and Sell results carry the same rail from the same shell and were not hit (measured). THE CLASS: a page whose element exists but is not on screen: this check measures the rail's box at 1440, 1280, 1024 and 390 on all three results pages, and scans every page for stray replacement markers.
// (2) THE SIGN IN STRIP came from today's page and was lifted into the shell as it was: a bare bar under the header, cut off at the left edge on a phone. The new design has no strip: the Account button is the way in and, signed in, the account menu (the address and Sign out), in the header's style.
// (3) THE DESTINATION: the Account button asked the card for "/tasks/mine", so every sign in ended on Tasks. What sets the destination: js/auth.js openSignInCard(subtitle, { dest }) remembers dest, else the page the card was opened on with its query (authRememberReturn), kept 30 minutes; authLandAfterSignIn goes there; with nothing remembered the new design goes Home.
//   SIGNED OUT: the Account button opens the sign in card and remembers THIS address, query intact, on every entry page and the history pages; Google's redirect carries it. SIGN IN: through the stubbed code door, back to where it started; Home when nothing was remembered.
//   SIGNED IN at 1440 and 390: the Account button opens a menu with the address and Sign out, inside the screen, in the header's type; no strip, no other element shows the address; Sign out signs out. SWEEP: nothing visible outside the header, the main area and the footer.
//   node scripts/goLiveSignedInCheck.mjs [--mutants]
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { execFileSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv.includes("--mutants")) {
  const MUT = [
    ["the Account button sends a sign in to Tasks again", "lib/_publicHead.js", "openSignInCard();}}catch(x){}});", 'openSignInCard(undefined,{dest:"/tasks/mine"});}}catch(x){}});'],
    ["the sign in strip is shown again", "lib/_publicHead.js", ".gas-signbar,.gas-signbar-m{display:none!important}", ".gas-signbar:not(:has(.hp-signout)),.gas-signbar-m:not(:has(.hp-signout)){display:none!important}"],
    ["the account menu does not open", "lib/_publicHead.js", "fill();m.hidden=!m.hidden;", "fill();"],
    ["nothing remembered does not go Home", "public/js/auth.js", 'if (window.GAS_NEW_DESIGN && window.__authLanded === "none") { location.assign("/"); return true; }', "return false;"],
    ["the stray $1 deleting the shell's grid wrapper (the rail falls back to the drawer)", "lib/preview/mcSellPreview.js", 'aria-controls="mvlist">Your searches</button></div><div class="mshell">`);', 'aria-controls="mvlist">Your searches</button></div>$1`);'],
    ["the rail's saved searches drawn as raw underlined links", "lib/preview/mcSellPreview.js", ".find-saved .srch{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;min-height:38px;padding:4px 10px;border-radius:8px;overflow:hidden;color:var(--ink);text-decoration:none;", ".find-saved .srch{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;min-height:38px;padding:4px 10px;border-radius:8px;overflow:hidden;color:var(--ink);text-decoration:underline;"],
    ["the address is not shown in the menu", "lib/_publicHead.js", 'm.querySelector(".acct-email").textContent=(e&&e.textContent)||"Signed in";', ""],
    ["Sign out does nothing", "lib/_publicHead.js", 'if(typeof authSignOut==="function")authSignOut();', ""]
  ];
  let bad = 0;
  for (const [name, file, from, to] of MUT) { const f = path.join(ROOT, file), orig = fs.readFileSync(f, "utf8"); if (!orig.includes(from)) { console.log("MUTANT NOT APPLICABLE: " + name); bad++; continue; } let code = 0;
    try { fs.writeFileSync(f, orig.replace(from, () => to)); try { execFileSync("node", [fileURLToPath(import.meta.url)], { stdio: "pipe" }); } catch (e) { code = e.status || 1; } } finally { fs.writeFileSync(f, orig); }
    console.log((code ? "caught   " : "MISSED   ") + "without " + name); if (!code) bad++; }
  console.log(bad ? "goLiveSignedInCheck mutants: " + bad + " not caught" : "goLiveSignedInCheck mutants: all " + MUT.length + " caught"); process.exit(bad ? 1 : 0);
}
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const { visitorWorld } = await import(pathToFileURL(path.join(ROOT, "scripts/_visitorWorld.mjs")).href); await visitorWorld(ROOT);
for (const k of ["NEW_DESIGN", "PUBLIC_EXAMPLES", "NEW_DESIGN_DATE"]) delete process.env[k]; Object.assign(process.env, { NEW_DESIGN: "all", PUBLIC_EXAMPLES: "1", SELL_NEXT_ON: "1" });
const { startSite } = await import(pathToFileURL(path.join(ROOT, "scripts/_localSite.mjs")).href), site = await startSite(ROOT), base = site.base;
const { openPage, closePage, EMAIL } = await import(pathToFileURL(path.join(ROOT, "scripts/_pageShots.mjs")).href), { probeRail, railProblems } = await import(pathToFileURL(path.join(ROOT, "scripts/_railProbe.mjs")).href), { HISTORY_HUB, HISTORY_VIN } = await import(pathToFileURL(path.join(ROOT, "scripts/_historyStub.mjs")).href);
const FX = await import(pathToFileURL(path.join(ROOT, "scripts/tasksFixture.mjs")).href);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core"), settle = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const O = o => ({ ROOT, base, FX, ...o });
const ENTRY = ["/", "/find", "/find?q=red+Porsche", "/market-check", "/market-check?q=1995+bmw+m3", "/sell", "/sell?car=2008+Porsche+911+Carrera", "/tasks", "/about", "/how-sam-decides", "/whats-new", "/business", "/feedback", "/terms", "/privacy", "/history", HISTORY_HUB, HISTORY_VIN];
const RESULTS = ["/find?q=red+Porsche", "/market-check?q=1995+bmw+m3", "/sell?car=2008+Porsche+911+Carrera"];
// ---- THE RAIL, on screen: Find, Market Check and Sell results, signed out and signed in, at four widths
for (const w of [1440, 1280, 1024, 390]) for (const signedIn of [false, true]) for (const url of RESULTS) {
  const pg = await openPage(b, O({ w, url, session: signedIn, recent: true })); await settle(1400);
  const p = await probeRail(pg), bad = railProblems(p, { signedIn, expectRecent: url.startsWith("/find") && w > 860, expectSaved: signedIn && url.startsWith("/find"), expectAlerts: signedIn && url.startsWith("/find") });
  ok(bad.length === 0, `${url} @${w} ${signedIn ? "signed in" : "signed out"}: the rail is on screen as designed (${bad.join("; ") || "ok"})`);
  if (w <= 860 && url.startsWith("/find")) ok(p.mvisits, `${url} @${w} ${signedIn ? "signed in" : "signed out"}: the Your searches button is on screen`);
  await closePage(pg);
}
// ---- A STRAY REPLACEMENT MARKER anywhere: every page, signed out
for (const url of ENTRY) { const pg = await openPage(b, O({ w: 1440, url })); const p = await probeRail(pg); ok(!p.stray, `${url}: no stray replacement marker ($1) in the page`); await closePage(pg); }
// ---- SIGNED OUT: the Account button opens the card on the same page and remembers this address
for (const url of ENTRY) {
  const pg = await openPage(b, O({ w: 1440, url })); await settle(700); const has = await pg.evaluate(() => !!document.getElementById("acct"));
  if (!has) { ok(false, `${url}: the page has the Account button`); await closePage(pg); continue; }
  await pg.click("#acct"); await settle(500);
  const r = await pg.evaluate(() => ({ modal: !!document.getElementById("auth-modal") || !!document.querySelector(".hp-dialog-scrim"), path: location.pathname + location.search, stored: (() => { try { return JSON.parse(localStorage.getItem("gas_signin_return") || "null"); } catch { return null; } })() }));
  ok(r.modal && r.path === url && r.stored && r.stored.path === url, `${url}: signed out, the Account button opens the sign in card on the same page and remembers this address, query intact (${r.stored && r.stored.path})`);
  await closePage(pg);
}
// ---- GOOGLE'S REDIRECT carries the same address
{ const url = "/find?q=red+Porsche", seen = {}, pg = await openPage(b, O({ w: 1440, url, seen })); await settle(700); await pg.click("#acct"); await settle(500);
  await pg.evaluate(() => { const g = document.querySelector(".auth-google"); if (g) g.click(); }); await settle(1200);
  const redirect = seen.authorize ? new URL(seen.authorize).searchParams.get("redirect_to") : null; ok(redirect === base + url, `Google sign in from Find: the return address is the page and its query (${redirect})`); await closePage(pg); }
// ---- SIGN IN through the stubbed code door: back to where it started; Home when nothing was remembered
async function signIn(pg, { forget = false } = {}) { await pg.click("#acct"); await settle(500); if (forget) await pg.evaluate(() => localStorage.removeItem("gas_signin_return")); await pg.type("#auth-email", EMAIL); await pg.evaluate(() => document.querySelector("#auth-modal .auth-email-btn").click()); await settle(1000);
  if (forget) await pg.evaluate(() => localStorage.removeItem("gas_signin_return")); await pg.type("#auth-code", "123456"); await pg.evaluate(() => document.querySelector("#auth-modal .auth-email-btn").click()); await settle(2200); }
for (const url of ["/find?q=red+Porsche", "/market-check?q=1995+bmw+m3", "/sell?car=2008+Porsche+911+Carrera", HISTORY_HUB, HISTORY_VIN, "/about"]) {
  const pg = await openPage(b, O({ w: 1440, url })); await settle(700); await signIn(pg); const here = await pg.evaluate(() => location.pathname + location.search), signed = await pg.evaluate(() => typeof authIsSignedIn === "function" && authIsSignedIn());
  ok(signed && here === url, `${url}: after signing in the browser is on the page it started from, query intact, and signed in (${here})`); await closePage(pg);
}
{ const pg = await openPage(b, O({ w: 1440, url: "/find?q=red+Porsche" })); await settle(700); await signIn(pg, { forget: true }); const here = await pg.evaluate(() => location.pathname + location.search); ok(here === "/", `nothing remembered: signing in goes Home (${here})`); await closePage(pg); }
// ---- SIGNED IN: the menu at both widths; no strip
for (const w of [1440, 390]) for (const url of ["/", "/find?q=red+Porsche", "/market-check?q=1995+bmw+m3", "/sell?car=2008+Porsche+911+Carrera", "/tasks", HISTORY_HUB]) {
  const pg = await openPage(b, O({ w, url, session: true })); await settle(1200);
  const before = await pg.evaluate(email => { const vis = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== "hidden" && c.display !== "none"; };
    return { strip: [...document.querySelectorAll(".gas-signbar, .gas-signbar-m, .hp-signout, .hp-account-email")].filter(vis).length, withEmail: [...document.querySelectorAll("body *")].filter(e => !/^(SCRIPT|STYLE)$/.test(e.tagName) && e.children.length === 0 && (e.textContent || "").includes(email) && vis(e)).length }; }, EMAIL);
  ok(before.strip === 0, `${url} @${w}: signed in, no sign in strip is visible (${before.strip})`); ok(before.withEmail === 0, `${url} @${w}: signed in, the address is shown nowhere until the menu is opened (${before.withEmail})`);
  await pg.click("#acct"); await settle(400);
  const m = await pg.evaluate(email => { const e = document.getElementById("acct-menu"), g = document.querySelector("header.gh"); if (!e) return null; const r = e.getBoundingClientRect(), c = getComputedStyle(e), hc = getComputedStyle(g), t = e.querySelector(".acct-email"), o = e.querySelector(".acct-out");
    return { open: !e.hidden && r.width > 0, text: (t && t.textContent) || "", out: !!o && o.getBoundingClientRect().width > 0 && /sign out/i.test(o.textContent), inView: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0, font: c.fontFamily === hc.fontFamily || /sans|Inter|system/i.test(c.fontFamily), bg: c.backgroundColor === hc.backgroundColor }; }, EMAIL);
  ok(!!m && m.open && m.text === EMAIL && m.out, `${url} @${w}: the Account button opens a menu with the address and Sign out (${m && m.text})`);
  ok(!!m && m.inView, `${url} @${w}: the menu is inside the screen, not cut off at an edge`); ok(!!m && m.bg && m.font, `${url} @${w}: the menu has the header's own colour and type`);
  await pg.keyboard.press("Escape"); await settle(250); ok(await pg.evaluate(() => document.getElementById("acct-menu").hidden), `${url} @${w}: Escape closes the menu`);
  await pg.click("#acct"); await settle(300); await pg.click("#acct-menu .acct-out"); await settle(700);
  const out = await pg.evaluate(() => ({ signed: typeof authIsSignedIn === "function" && authIsSignedIn(), hidden: document.getElementById("acct-menu").hidden })); ok(!out.signed && out.hidden, `${url} @${w}: Sign out signs out and the menu closes`);
  ok(pg.__errs.length === 0, `${url} @${w}: no page errors (${pg.__errs.join("; ")})`); await closePage(pg);
}
// ---- SWEEP: every route, signed in against signed out: nothing visible appears that only a signed in page has (a strip, a badge row, a bar), except inside the header (the Account menu) and the footer
const sig = () => { const vis = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== "hidden" && c.display !== "none"; };
  return [...document.body.querySelectorAll("*")].filter(e => !/^(SCRIPT|STYLE|NOSCRIPT|LINK|META|PATH|SVG|BR)$/i.test(e.tagName) && vis(e) && !e.closest("header.gh, footer, .ft, #auth-modal, .hp-dialog-scrim, .gas-consent-banner")).map(e => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className ? "." + e.className.split(" ")[0] : "")); };
for (const url of ENTRY) {
  const a = await openPage(b, O({ w: 1440, url })); await settle(1000); const out = await a.evaluate(sig); await closePage(a);
  const c = await openPage(b, O({ w: 1440, url, session: true })); await settle(1000); const inn = await c.evaluate(sig); await closePage(c);
  const count = l => l.reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {}), co = count(out), ci = count(inn), extra = Object.keys(ci).filter(k => (ci[k] || 0) > (co[k] || 0) && !/^(a|li|div|span|p|button|h[1-6]|ul|svg|img|input|label|b|i|small)(\.[\w-]+)?$/.test(k.replace(/#.*$/, "")) || /gas-signbar|signbar|hp-sign|hp-account/.test(k));
  ok(extra.length === 0, `${url}: signed in, no element appears that a signed out page does not have (${extra.join(", ") || "none"})`);
}
await b.close(); site.close();
console.log(`goLiveSignedInCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
