// goLiveShots (Lane E, Nov 11 2026): FULL PAGE SCREENSHOTS of this tree's new design, as a visitor and signed in, at 1440, 1280, 1024 and 390, into docs/go-live-shots/<route>-<state>-<width>.png, so the pages can be looked at, not just measured.
// HOW: this tree's page handlers run on a local port over the stored-pick world (scripts/_localSite.mjs); the pages' own data calls (the searches) go to the LIVE site, read only, so the results are real. SIGNED IN is a stub: a test session in the browser and a stand-in account (Saved searches, Before it ends, Recent searches, the Tasks list), because no real account was available; it shows the layout, not a real person's data.
// The history page is this tree's handler over the stub archive (the live archive is not read), so its cars are stand-ins. Needs the Keychain item goasksam-bypass for the live reads (read in process, never printed).
//   node scripts/goLiveShots.mjs [--only <route>] [--out <dir>]
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { execFileSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), ".."), args = process.argv.slice(2), only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null, OUT = path.resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(ROOT, "docs/go-live-shots"));
fs.mkdirSync(OUT, { recursive: true });
let BYP = ""; try { BYP = execFileSync("security", ["find-generic-password", "-s", "goasksam-bypass", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
const realFetch = globalThis.fetch;
const { visitorWorld } = await import(pathToFileURL(path.join(ROOT, "scripts/_visitorWorld.mjs")).href); await visitorWorld(ROOT);
for (const k of ["NEW_DESIGN", "PUBLIC_EXAMPLES", "NEW_DESIGN_DATE"]) delete process.env[k]; Object.assign(process.env, { NEW_DESIGN: "all", PUBLIC_EXAMPLES: "1", SELL_NEXT_ON: "1" });
const { startSite } = await import(pathToFileURL(path.join(ROOT, "scripts/_localSite.mjs")).href), site = await startSite(ROOT);
const { openPage, closePage } = await import(pathToFileURL(path.join(ROOT, "scripts/_pageShots.mjs")).href), { HISTORY_HUB } = await import(pathToFileURL(path.join(ROOT, "scripts/_historyStub.mjs")).href), FX = await import(pathToFileURL(path.join(ROOT, "scripts/tasksFixture.mjs")).href);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core"), settle = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const proxy = { fetch: realFetch, base: "https://goasksam.com", bypass: BYP };
const ROUTES = [
  ["home", "/", "plain"], ["find-landing", "/find", "plain"], ["find-results", "/find?q=red+Porsche", "find"], ["market-check-landing", "/market-check", "plain"], ["market-check-results", "/market-check?q=1995+bmw+m3", "mc"],
  ["sell-landing", "/sell", "plain"], ["sell-results", "/sell?car=2008+Porsche+911+Carrera", "sell"], ["tasks", "/tasks", "tasks"], ["history", HISTORY_HUB, "plain"]
].filter(r => !only || r[0] === only);
const manifest = [];
for (const [name, url0, kind] of ROUTES) for (const state of ["visitor", "signed-in"]) {
  const signed = state === "signed-in", url = name === "tasks" && signed ? "/tasks/mine?app=1" : url0;
  const pg = await openPage(b, { ROOT, base: site.base, w: 1440, h: 900, url, session: signed, recent: true, proxy, FX });
  // wait for what the page draws: Find's cars, Market Check's figures, Sell's pick (answering its questions with the first choice)
  const t0 = Date.now(); let note = "";
  if (kind === "find") { await pg.waitForSelector("article.car", { timeout: 75000 }).catch(() => { note = "no cars drawn in 75 s"; }); await settle(2500); }
  else if (kind === "mc") { for (let k = 0; k < 18; k++) { const n = await pg.evaluate(() => (document.body.innerText.match(/\$\d[\d,]+/g) || []).length).catch(() => 0); if (n > 2) break; await settle(4000); } await settle(2000); }
  else if (kind === "sell") { for (let k = 0; k < 16; k++) { const r = await pg.evaluate(() => /SAM'?S PICK/i.test(document.body.innerText)).catch(() => false); if (r) break; await pg.evaluate(() => { const e = [...document.querySelectorAll("button.chip, .chip, .chips button, .qchips button, [data-chip], .opts button")].find(x => x.getBoundingClientRect().width > 0); if (e) e.click(); }).catch(() => {}); await settle(4500); } await settle(1500); }
  else await settle(2500);
  for (const w of [1440, 1280, 1024, 390]) {
    await pg.setViewport({ width: w, height: 900 }); await settle(900); const file = `${name}-${state}-${w}.png`;
    await pg.screenshot({ path: path.join(OUT, file), fullPage: true }); manifest.push(file + (note ? "  (" + note + ")" : "")); console.log("shot " + file + (note ? "  NOTE " + note : "") + `  (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
  if (name === "home" && signed) for (const w of [1440, 390]) { await pg.setViewport({ width: w, height: 900 }); await settle(600); await pg.click("#acct").catch(() => {}); await settle(500); const file = `account-menu-signed-in-${w}.png`; await pg.screenshot({ path: path.join(OUT, file), fullPage: false }); manifest.push(file); console.log("shot " + file); await pg.click("#acct").catch(() => {}); }
  await closePage(pg);
}
fs.writeFileSync(path.join(OUT, "README.txt"), "Screenshots of the new design (go live), made by scripts/goLiveShots.mjs on " + new Date().toISOString().slice(0, 10) + ".\nFile names: <route>-<visitor|signed-in>-<width>.png at 1440, 1280, 1024 and 390 wide, full page.\nThe pages are this tree's; the results are real (searches read from the live site). SIGNED IN is a stub session with a stand-in account (saved searches, Before it ends, recent searches, Tasks list): it shows the layout, not a real person's data. The history page uses a stub archive (stand-in cars).\n\n" + manifest.join("\n") + "\n");
await b.close(); site.close(); console.log("goLiveShots: " + manifest.length + " screenshots in " + OUT); process.exit(0);
