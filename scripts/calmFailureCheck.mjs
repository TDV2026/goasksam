// A DATABASE FAILURE IS A CALM PAGE (Lane S review, Oct 27 2026): api/sell.js and api/specPage.js used to have no try/catch, so a database failure showed the platform's generic 500
// page. They now answer what the holding page answers in look: 503, Retry-After, one plain sentence, no error text; the detail goes to the server log only. This check makes the
// database fail (every outside call throws, and a handler stub throws a database-shaped error) and reads what the visitor gets. No network.   node scripts/calmFailureCheck.mjs
process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "a"; delete process.env.CURTAIN_SEALED;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const DBERR = 'connect ECONNREFUSED db.test:5432 relation "public.sales_archive" does not exist';
globalThis.fetch = async () => { throw new Error(DBERR); };
const logged = []; const realErr = console.error; console.error = (...a) => logged.push(a.join(" "));
const resOf = () => ({ code: 0, h: {}, body: "", headersSent: false, setHeader(k, v) { this.h[k.toLowerCase()] = v; }, getHeader(k) { return this.h[k.toLowerCase()]; }, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); this.headersSent = true; return this; }, json(b) { this.body = JSON.stringify(b); this.headersSent = true; return this; }, end() { this.headersSent = true; return this; } });
const { withCalm, CALM_PAGE_TEXT, calmHtml } = await import("../lib/_hold.js");
// the wrapper turns a thrown database error (sync or async) into the calm answer
for (const [name, h] of [["async throw", async () => { throw new Error(DBERR); }], ["sync throw", () => { throw new Error(DBERR); }]]) {
  const r = resOf(); await withCalm(h, "stub")({ method: "GET", url: "/x", headers: {} }, r);
  ok(r.code === 503 && r.h["retry-after"] === "30" && r.body.includes(CALM_PAGE_TEXT), `${name}: 503, Retry-After 30, the plain sentence`);
  ok(!/ECONNREFUSED|sales_archive|relation|db\.test|Error:/.test(r.body + JSON.stringify(r.h)), `${name}: no error text reaches the visitor`);
  ok(r.h["cache-control"] === "no-store" && /text\/html/.test(r.h["content-type"]), `${name}: not cached, an HTML page`);
}
const keep = resOf(); keep.headersSent = true; await withCalm(async () => { throw new Error("late"); }, "stub")({ headers: {} }, keep);
ok(keep.code === 0, "a response already sent is left alone");
ok(logged.some(l => /ECONNREFUSED/.test(l)), "the detail goes to the server log");
// the real routes: each default export is wrapped, and a real request with the database down never ends in a bare 500
const fs = await import("node:fs");
ok(/export default withCalm\(handler, "sell"\)/.test(fs.readFileSync("api/sell.js", "utf8")), "api/sell.js default export is wrapped by withCalm");
ok(/withTracking\("\/api\/specPage", withCalm\(handler, "specPage"\), "site"\)/.test(fs.readFileSync("api/specPage.js", "utf8")), "api/specPage.js default export is wrapped by withCalm");
const { default: sell } = await import("../api/sell.js"), { default: spec } = await import("../api/specPage.js");
for (const [name, h, url] of [["sell", sell, "/sell"], ["specPage", spec, "/911/997-carrera"]]) {
  const r = resOf(); await Promise.race([h({ method: "GET", url, query: { slug: "997-carrera" }, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, r), new Promise(res => setTimeout(res, 20000))]);
  ok(r.code !== 500 && !/ECONNREFUSED|sales_archive|relation/.test(r.body), `${name} with the database down: not a bare 500, no error text (status ${r.code})`);
}
ok(!/[–—]/.test(calmHtml()) && !/\b(limit|business)\b/i.test(calmHtml().replace(/<style>[\s\S]*?<\/style>/, "")), "the calm page has no dashes and none of the words limit or business");
console.error = realErr;
console.log(`calmFailureCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
