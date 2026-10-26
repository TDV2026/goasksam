// /sell door check (Lane C, Oct 26 2026): api/sell.js picks the Sell per request. Crew sees the newer Sell at /sell and at result addresses,
// the public sees the previous Sell while SELL_NEXT_ON is off, and SELL_NEXT_ON=1 flips the public to the newer one. Offline, no network.
import fs from "node:fs";
process.env.LAUNCH_STAGE = "2";
process.env.CURTAIN_CREW_CODE = "route-check-only-value";
const { mintCrewCookieValue } = await import("../lib/_crew.js");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
function call(handler, url, { cookie = "", headers = {} } = {}) {
  return new Promise(resolve => {
    const hdr = {}; const req = { method: "GET", url, headers: { host: "goasksam.com", cookie, ...headers }, query: {} };
    const res = { setHeader: (k, v) => { hdr[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, hdr, body: JSON.stringify(b) }); }, send(b) { resolve({ code: this.code, hdr, body: String(b) }); }, end() { resolve({ code: this.code, hdr, body: "" }); } };
    Promise.resolve(handler(req, res)).catch(e => resolve({ code: 500, hdr, body: String(e) }));
  });
}
const NEW = b => /Tell Sam the car you're selling|GAS_SELL_CFG/.test(b);
const OLD = b => /id="msgs"/.test(b) && !/GAS_SELL_CFG/.test(b);
const src = fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
const cfg = JSON.parse(src);
const sellRw = cfg.rewrites.filter(r => r.source === "/sell");
ok(sellRw.length === 1 && sellRw[0].destination === "/api/sell" && !sellRw[0].has, "vercel.json has one /sell rewrite, to /api/sell, no conditions");
ok(cfg.functions["api/sell.js"] && /sell-old\.html/.test(cfg.functions["api/sell.js"].includeFiles) && /onebox\.html/.test(cfg.functions["api/sell.js"].includeFiles), "api/sell.js ships both templates");
ok(cfg.redirects.some(r => r.source === "/sell-old.html" && r.destination === "/sell"), "/sell-old.html still redirects to /sell");
const door = (await import("../api/sell.js")).default;
let crew = ""; try { crew = "gas_crew=" + mintCrewCookieValue(); } catch {}
ok(!!crew, "a crew cookie can be minted for the check");
for (const [flag, label] of [[undefined, "flag off"], ["1", "flag on"]]) {
  if (flag) process.env.SELL_NEXT_ON = flag; else delete process.env.SELL_NEXT_ON;
  const pub = await call(door, "/sell"), pubCar = await call(door, "/sell?car=2004%20Porsche%20911"), cr = await call(door, "/sell", { cookie: crew }), crCar = await call(door, "/sell?car=2004%20Porsche%20911", { cookie: crew });
  ok(cr.code === 200 && NEW(cr.body), label + ": crew at /sell sees the newer Sell");
  ok(crCar.code === 200 && NEW(crCar.body), label + ": crew at a result address sees the newer Sell");
  if (!flag) {
    ok(pub.code === 200 && OLD(pub.body), "flag off: the public at /sell sees the previous Sell");
    ok(pubCar.code === 200 && OLD(pubCar.body) && /noindex/.test(pubCar.hdr["x-robots-tag"] || ""), "flag off: the public at a result address sees the previous Sell, noindex");
  } else {
    ok(pub.code === 200 && NEW(pub.body), "flag on: the public at /sell sees the newer Sell");
    ok(pubCar.code === 200 && NEW(pubCar.body), "flag on: the public at a result address sees the newer Sell");
  }
}
// The old door: /api/sellPage goes to /sell when the flag is on (one switch closes every route to the old wizard), and serves the old Sell when it is off.
{ const page = (await import("../api/sellPage.js")).default;
  process.env.SELL_NEXT_ON = "1";
  const on = await call(page, "/api/sellPage"), onQ = await call(page, "/api/sellPage?car=2004%20Porsche%20911");
  ok(on.code === 302 && on.hdr["location"] === "/sell", "flag on: /api/sellPage redirects to /sell (" + on.code + " " + on.hdr["location"] + ")");
  ok(onQ.code === 302 && onQ.hdr["location"] === "/sell?car=2004%20Porsche%20911", "flag on: the query goes with it");
  delete process.env.SELL_NEXT_ON;
  const off = await call(page, "/api/sellPage");
  ok(off.code === 200 && OLD(off.body), "flag off: /api/sellPage still serves the previous Sell"); }
delete process.env.SELL_NEXT_ON;
console.log(`sellRouteCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
