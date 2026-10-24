// VIN CASES PEEK (Lane B, Oct 23 2026, Stage 3): load Market Check for each typed identifier in a real browser as crew and print what the visitor
// sees (the first lines of the page text). READ ONLY. The crew cookie and the probe key stay in headers/cookies, never printed.
//   PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)" node scripts/vinCasesPeek.mjs [--base https://goasksam.com] [--q "a|b"] [--wait 40000]
import puppeteer from "puppeteer-core";
import { crewCookie } from "./_crewCookie.mjs";
const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, ""), HOST = new URL(BASE).host;
const QS = (arg("q") || "11304412010836|WP0CA2995SS340422|WP0BA29983S635608|porsche 996 carrera").split("|");
const WAIT = Number(arg("wait")) || 40000, KEY = process.env.PROBE_KEY || null, BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || null;
if (!KEY) { console.log("vinCasesPeek: no PROBE_KEY."); process.exit(1); }
const crew = await crewCookie();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
for (const q of QS) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 900 });
  if (crew) await page.setCookie({ name: "gas_crew", value: crew, domain: HOST, path: "/", secure: true });
  await page.setRequestInterception(true);
  page.on("request", r => { let own = false; try { own = new URL(r.url()).host === HOST; } catch {} r.continue(own ? { headers: { ...r.headers(), "x-ops-key": KEY, "x-launch-stage-test": "2", ...(BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {}) } } : undefined); });
  const t0 = Date.now();
  await page.goto(BASE + "/market-check", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));
  const sel = await page.$("textarea, input[type=text], input:not([type])");
  if (sel) { await sel.focus(); await page.keyboard.type(q, { delay: 5 }); await page.keyboard.press("Enter"); }
  let txt = "";
  for (let i = 0; i < WAIT / 1000; i++) { await new Promise(r => setTimeout(r, 1000)); txt = await page.evaluate(() => (document.querySelector("main") || document.body).innerText).catch(() => ""); if (/\$\d[\d,]{3,}|Sold before|Which |not find|did you mean|No sales|catching his breath|could not verify/i.test(txt) && i > 3) break; }
  const lines = txt.split("\n").map(s => s.trim()).filter(Boolean).slice(0, Number(arg("lines")) || 26);
  console.log(`\n=== "${q}"  (${Math.round((Date.now() - t0) / 1000)}s)`); console.log(lines.join(" | ").slice(0, Number(arg("chars")) || 1400));
  await page.close();
}
await browser.close();
