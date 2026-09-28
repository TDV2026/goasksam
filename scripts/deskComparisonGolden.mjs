// Desk comparison golden (Stage C): a comparison must NEVER drop a named trim/badge (no silent
// substitution). "Z28 vs Trans Am WS6" must compare the Z28 and the Trans Am WS6, scoped to the
// WS6 period - not the whole Camaro vs the whole Firebird. Production, crew cookie.
//   node scripts/deskComparisonGolden.mjs [https://base]
import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = (process.argv.find(a => a.startsWith("http")) || "https://goasksam.com").replace(/\/$/, "");
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: new URL(BASE).hostname, path: "/" });
await p.goto(BASE + "/desk", { waitUntil: "networkidle2" });
const ask = q => p.evaluate(async (BASE, q) => {
  const r = await fetch(BASE + "/api/desk", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ desk: true, action: "interpret", question: q, run: true }) });
  const j = await r.json();
  return { cannot: j.cannot_apply || null, comparison: j.comparison ? { scopes: j.comparison.scopes, period: j.comparison.period, members: (j.comparison.members || []).map(m => m.group) } : null };
}, BASE, q);

let fails = 0; const ck = (n, ok, d = "") => { console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  -> " + d)); if (!ok) fails++; };

const r = await ask("Z28 vs Trans Am WS6");
console.log("  " + JSON.stringify(r));
const scopes = (r.comparison && r.comparison.scopes) || [];
const joined = scopes.join(" | ").toLowerCase();
// The named trims must survive onto the compared scopes (or the Desk must refuse, never compare wider).
ck("comparison carries the Z28 trim", /z28/.test(joined) || (r.cannot && /z28|trim/i.test(r.cannot)), joined);
ck("comparison carries the Trans Am WS6 trim", /ws6/.test(joined) || (r.cannot && /ws6|trim/i.test(r.cannot)), joined);
ck("did NOT silently compare whole Camaro vs whole Firebird", !(r.comparison && scopes.length === 2 && /^chevrolet camaro$/i.test(scopes[0]) && /^pontiac firebird$/i.test(scopes[1])), "compared whole models");
ck("WS6 period applied to both sides", !r.comparison || !!r.comparison.period, "no period on a WS6 comparison");

await b.close();
console.log(`\n${fails ? fails + " FAILURE(S): a comparison dropped a named trim." : "Comparison golden passed."}`);
process.exit(fails ? 1 : 0);
