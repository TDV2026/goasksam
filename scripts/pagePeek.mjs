// PAGE PEEK (Lane B, Oct 15 2026): load one Market Check page in a real browser with the test-stage header, wait for a
// result or a question, and print the page's first lines plus every console error and failed request, so a page that
// renders nothing can be told apart from an API that answers (B2's probe saw "1969 Chevrolet Camaro: no answer in 45s").
//
//   export PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)"   # per command, never printed
//   node scripts/pagePeek.mjs --q "1969 Chevrolet Camaro" [--base https://goasksam.com] [--wait 45000]
import puppeteer from "puppeteer-core";

const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, "");
const Q = arg("q") || "1969 Chevrolet Camaro";
const WAIT = Number(arg("wait")) || 45000;
const KEY = process.env.PROBE_KEY || null;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!KEY) { console.log("pagePeek: no PROBE_KEY in the environment."); process.exit(1); }
const READY = /\$\d[\d,]{2,}|catching his breath|limit of \d+ cars|which (one|generation|body|model|year|trim)|did you mean|sale on record|sales? (since|in the last)/i;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 600000, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  const host = new URL(BASE).host;
  const errors = [], failed = [], apis = [];
  page.on("pageerror", e => errors.push("pageerror: " + String(e && e.message || e).slice(0, 200)));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
  page.on("requestfailed", r => failed.push(r.url().slice(0, 120) + " " + (r.failure() && r.failure().errorText)));
  page.on("response", async r => { try { const u = new URL(r.url()); if (u.host === host && /\/api\//.test(u.pathname)) apis.push(`${r.status()} ${u.pathname}${u.search.slice(0, 40)} ${Date.now()}`); } catch {} });
  await page.setViewport({ width: 1280, height: 900 });
  await page.setRequestInterception(true);
  page.on("request", rq => { let own = false; try { own = new URL(rq.url()).host === host; } catch {} rq.continue(own ? { headers: { ...rq.headers(), "x-ops-key": KEY, "x-launch-stage-test": "2" } } : undefined); });
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 800));
  const t0 = Date.now();
  await page.goto(BASE + "/market-check?q=" + encodeURIComponent(Q), { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  let text = "";
  while (Date.now() - t0 < WAIT) { text = await page.evaluate(() => document.body ? document.body.innerText : "").catch(() => ""); if (READY.test(text)) break; await new Promise(r => setTimeout(r, 500)); }
  const ms = Date.now() - t0;
  console.log(`${Q}: ${READY.test(text) ? "READY" : "NOT READY"} after ${ms}ms, url ${page.url()}`);
  console.log("first lines: " + text.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 14).join(" | ").slice(0, 900));
  console.log("api calls: " + (apis.length ? apis.map(a => a.replace(/ \d+$/, "")).join(" ; ") : "none"));
  console.log("errors: " + (errors.length ? errors.join(" ; ") : "none"));
  console.log("failed requests: " + (failed.length ? failed.join(" ; ") : "none"));
} finally { await browser.close(); }
