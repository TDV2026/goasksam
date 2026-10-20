// LIVE: this script calls production (goasksam.com). Run it only in a gap the lanes name, with the protection-bypass header (Lane F's rule, Oct 20 2026).
// FETCH JSON (Lane B, Oct 2026): GET one of the site's own endpoints from a real browser context (the bot protection
// answers plain curl with a challenge page) and print the JSON, with any secret-looking value masked.
//   export PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)"
//   node scripts/fetchJson.mjs --path /api/publicConfig [--base https://goasksam.com]
import puppeteer from "puppeteer-core";
const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, "");
const PATH = arg("path") || "/api/publicConfig";
const KEY = process.env.PROBE_KEY || null;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 600000, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  const r = await page.evaluate(async (u, k) => {
    const res = await fetch(u, { headers: k ? { "x-ops-key": k } : {} });
    const txt = await res.text(); let d = null; try { d = JSON.parse(txt); } catch {}
    return { status: res.status, d, raw: d ? null : txt.slice(0, 200) };
  }, BASE + PATH, KEY);
  const mask = o => { if (!o || typeof o !== "object") return o; const out = Array.isArray(o) ? [] : {}; for (const [k, v] of Object.entries(o)) out[k] = (typeof v === "string" && (/key|secret|token/i.test(k) || v.length > 60)) ? `<${v.length} chars>` : (typeof v === "object" ? mask(v) : v); return out; };
  console.log(`${PATH}: HTTP ${r.status} ${JSON.stringify(r.d ? mask(r.d) : r.raw)}`);
} finally { await browser.close(); }
