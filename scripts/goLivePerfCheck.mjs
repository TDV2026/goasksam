// goLivePerfCheck (Lane E, Nov 10 2026, go live Stage 4): NO PUBLIC PAGE IS SLOWER TO A FIRST USABLE SEARCH THAN TODAY, at 1440 and 390.
// For Home, Find, Market Check, Sell and Tasks (the landing pages): the page as it is today (NEW_DESIGN off) against the new page (on), the same handler, the same stubbed database.
//   BYTES   the HTML the browser must download, plain and gzipped: the new page must not be heavier than today's (a photo inline as base64 made Home four times heavier and was taken out)
//   SERVER  the handler's own time, median of 7: the new page may add at most 25 ms (the door runs today's handler once and re-uses its answer)
//   BROWSER the time from the page's HTML being handed to Chrome to the first visible, focusable search box (or Tasks' create button), median of 5, network off, at 1440 and 390: at most 40 ms slower than today
//   node scripts/goLivePerfCheck.mjs [--print]
import path from "node:path"; import zlib from "node:zlib"; import { fileURLToPath, pathToFileURL } from "node:url"; import { createRequire } from "node:module";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
process.env.LAUNCH_STAGE = "2"; delete process.env.CURTAIN_SEALED; delete process.env.NEW_DESIGN;
process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "k";
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [], text: async () => "[]", headers: { get: () => null } });
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
const origLog = console.log, origErr = console.error; const quiet = async fn => { console.log = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = origLog; console.error = origErr; } };
const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
const PAGES = [["home", "/", "home"], ["find", "/find", "buy"], ["market-check", "/market-check", "marketCheck"], ["sell", "/sell", "sell"], ["tasks", "/tasks", "tasksPage"]];
async function run(h, url) { const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = String(v); return this; }, getHeader() {}, removeHeader() {}, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); return this; }, end() { return this; }, json() { return this; } };
  const t = performance.now(); await quiet(() => h({ method: "GET", url, query: Object.fromEntries(new URL(url, "https://x").searchParams), headers: { host: "goasksam.com" }, socket: {} }, res).catch(() => {})); return { ms: performance.now() - t, body: res.body }; }
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
async function usable(html, width) {
  const p = await b.newPage(); await p.setViewport({ width, height: 900 }); await p.setRequestInterception(true); p.on("request", r => r.abort());
  const t0 = performance.now(); await p.setContent(html, { waitUntil: "domcontentloaded" }).catch(() => {});
  await p.waitForFunction(() => { const c = [...document.querySelectorAll("main textarea, main input[type=text], main input:not([type]), textarea, input[type=text], input:not([type]), #tkcta, main button")].find(e => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden" && !e.disabled); if (!c) return false; c.focus(); return document.activeElement === c; }, { timeout: 8000 }).catch(() => {});
  const ms = performance.now() - t0; await p.close(); return ms;
}
for (const [name, url, f] of PAGES) {
  const h = (await import(pathToFileURL(path.join(ROOT, "api", f + ".js")).href)).default;
  const side = async on => { if (on) process.env.NEW_DESIGN = "all"; else delete process.env.NEW_DESIGN; const ms = []; let body = ""; for (let i = 0; i < 7; i++) { const r = await run(h, url); ms.push(r.ms); body = r.body; } delete process.env.NEW_DESIGN; return { ms: med(ms), body, bytes: Buffer.byteLength(body), gz: zlib.gzipSync(body).length }; };
  const A = await side(false), B = await side(true);
  if (process.argv.includes("--print")) origLog(name.padEnd(14), "bytes", A.bytes, "->", B.bytes, "gzip", A.gz, "->", B.gz, "server ms", A.ms.toFixed(1), "->", B.ms.toFixed(1));
  ok(B.gz <= A.gz, `${name}: the new page is not heavier to download than today's (gzip ${A.gz} today, ${B.gz} new)`);
  ok(B.ms <= A.ms + 25, `${name}: the handler adds at most 25 ms (${A.ms.toFixed(1)} today, ${B.ms.toFixed(1)} new)`);
  for (const w of [1440, 390]) {
    const a = [], n = []; for (let i = 0; i < 5; i++) { a.push(await usable(A.body, w)); n.push(await usable(B.body, w)); }
    const ma = med(a), mn = med(n); if (process.argv.includes("--print")) origLog(`  ${name} @${w}: first usable ${ma.toFixed(0)} ms today, ${mn.toFixed(0)} ms new`);
    ok(mn <= ma + 40, `${name} @${w}: first usable search is no slower than today (${ma.toFixed(0)} ms today, ${mn.toFixed(0)} ms new)`);
  }
}
await b.close();
for (const l of out) origLog(l);
origLog(`goLivePerfCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
