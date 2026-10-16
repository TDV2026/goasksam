// BUY PROBE (Lane E, Oct 16 2026): one keyed POST to /api/buySearch from a real page (raw fetch gets the Vercel challenge).
// Read-only diagnostics. The key comes from the environment and goes only in the x-ops-key / x-probe-key headers of same-origin
// requests, never printed. Prints {status, ms} then the raw body (an SSE stream for a chat turn).
//   PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)" node scripts/buyProbe.mjs '{"action":"parse","text":"Porsche 911"}'
import puppeteer from "puppeteer-core";
const KEY = process.env.PROBE_KEY; if (!KEY) process.exit(1);
const body = JSON.parse(process.argv[2]); const HOST = "goasksam.com";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"], protocolTimeout: 300000 });
const p = await b.newPage(); await p.setRequestInterception(true);
p.on("request", r => { let own = false; try { own = new URL(r.url()).host === HOST; } catch {} r.continue(own ? { headers: { ...r.headers(), "x-ops-key": KEY, "x-probe-key": KEY, "x-launch-stage-test": "2" } } : undefined); });
await p.goto("https://goasksam.com/buy", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
const out = await p.evaluate(async body => { const t0 = Date.now(); const r = await fetch("/api/buySearch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const txt = await r.text(); return { status: r.status, ms: Date.now() - t0, txt }; }, body);
await b.close();
console.log(JSON.stringify({ status: out.status, ms: out.ms })); console.log(out.txt);
