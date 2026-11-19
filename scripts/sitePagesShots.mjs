// Screenshots of the site pages on the new shell from the live handlers' own pages: node scripts/sitePagesShots.mjs [key ...]   (writes proofs/sitepages/)
import { launch, imp } from "./deskV3Harness.mjs";
import fs from "node:fs";
const CP = await imp("api/crewPage.js"), { mintCrewCookieValue } = await imp("lib/_crew.js");
async function call(url) { return new Promise(resolve => { const u = new URL(url, "https://goasksam.com"), res = { h: {}, code: 200, setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader() {}, removeHeader() {}, writeHead(c) { this.code = c; return this; }, status(c) { this.code = c; return this; }, send(x) { resolve({ code: this.code, body: String(x) }); return this; }, end(x) { return this.send(x || ""); }, json(o) { return this.send(JSON.stringify(o)); } }; CP.default({ method: "GET", url, query: Object.fromEntries(u.searchParams), headers: { cookie: "gas_crew=" + mintCrewCookieValue(), host: "goasksam.com" }, socket: {}, body: null }, res); }); }
const keys = process.argv.slice(2).length ? process.argv.slice(2) : ["business", "how", "about", "whatsnew", "feedback", "terms", "privacy"];
const b = await launch(); fs.mkdirSync("proofs/sitepages", { recursive: true });
for (const k of keys) { const r = await call("/api/crewPage?page=preview-site-" + k); console.log(k, r.code, r.body.length); if (r.code !== 200) continue;
  for (const w of [1440, 390]) { const p = await b.newPage(); await p.setViewport({ width: w, height: 900 }); await p.setRequestInterception(true); p.on("request", q => /^https?:/.test(q.url()) && new URL(q.url()).host !== "about:blank" ? q.respond({ status: 204, body: "" }) : q.continue()); await p.setContent(r.body, { waitUntil: "load" }); await new Promise(x => setTimeout(x, 300)); await p.screenshot({ path: `proofs/sitepages/${k}-${w}.png`, fullPage: true }); await p.close(); } }
await b.close();
