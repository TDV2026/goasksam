// Shared by sitePagesShellCheck and sitePagesContentCheck (Lane E, Nov 9 2026): each site page as the crew door serves it (the preview, from the live handler's own page) and as the live handler answers it.
import { launch, imp, puppeteer } from "./deskV3Harness.mjs";
export { launch };
export const CP = await imp("api/crewPage.js"), SP = await imp("lib/preview/sitePages.js"), PP = await imp("lib/preview/previewPages.js"), { mintCrewCookieValue } = await imp("lib/_crew.js");
export const SITE_KEYS = Object.keys(SP.SITE);
const LIVE = { business: "business", how: "howSamDecides", about: "about", whatsnew: "whatsNew", feedback: "feedback", terms: "legal", privacy: "legal" };
function call(handler, url, cookie = true) { return new Promise(resolve => { const u = new URL(url, "https://goasksam.com"), res = { h: {}, code: 200, setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader() {}, removeHeader() {}, writeHead(c) { this.code = c; return this; }, status(c) { this.code = c; return this; }, send(x) { resolve({ code: this.code, body: String(x) }); return this; }, end(x) { return this.send(x || ""); }, json(o) { return this.send(JSON.stringify(o)); } }; handler({ method: "GET", url, query: Object.fromEntries(u.searchParams), headers: { cookie: cookie ? "gas_crew=" + mintCrewCookieValue() : "", host: "goasksam.com" }, socket: {}, body: null }, res); }); }
export const previewOf = async key => (await call(CP.default, "/api/crewPage?page=preview-site-" + key)).body;
export const previewStranger = async key => (await call(CP.default, "/api/crewPage?page=preview-site-" + key, false)).code;
export const liveOf = async key => { const s = SP.SITE[key], h = (await import("../api/" + s.api + ".js")).default; return (await call(h, "/api/" + s.api + (s.query ? "?" + s.query : ""))).body; };
export const homeOf = () => PP.homeHtml();
export async function openHtml(b, html, w, h = 900) { const p = await b.newPage(); await p.setViewport({ width: w, height: h }); await p.setRequestInterception(true); p.on("request", r => /^https?:/.test(r.url()) ? r.respond({ status: 204, body: "" }) : r.continue()); await p.setContent(html, { waitUntil: "load" }); await new Promise(r => setTimeout(r, 250)); return p; }
export const tally = () => { let pass = 0, fail = 0; const out = []; return { ok: (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } }, done: name => { console.log(out.join("\n")); console.log(`${name}: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0); } }; };
