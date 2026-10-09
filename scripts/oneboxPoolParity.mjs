// One Box typed-vs-VIN pool parity golden (Sep 2026).
// The SAME car asked two ways - a typed nameplate and a resolved (VIN-style) vehicle - must read
// the SAME pool. Fails if the two pools differ, or if a known model-level sale set is missing from
// either (the Murcielago accent bug: typed saw 1 sale, VIN saw 9). Production, crew cookie.
//   node scripts/oneboxPoolParity.mjs [https://base]
import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = (process.argv.find(a => a.startsWith("http")) || "https://goasksam.com").replace(/\/$/, "");
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: process.env.GAS_CREW_COOKIE || "", domain: new URL(BASE).hostname, path: "/" });
await p.goto(BASE + "/onebox", { waitUntil: "networkidle2" });

const poolOf = body => p.evaluate(async (BASE, body) => {
  const r = await fetch(BASE + "/api/sellerDecision", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  const recs = (j.thin && j.thin.receipts) || (j.classEra && j.classEra.receipts) || [];
  const ids = recs.map(x => (x.title || "") + "|$" + x.hammer).sort();
  const hs = recs.map(x => x.hammer).filter(n => n > 0);
  return { tier: j.tier, model: j.resolvedCar && j.resolvedCar.model, n: recs.length, lo: hs.length ? Math.min(...hs) : null, hi: hs.length ? Math.max(...hs) : null, ids };
}, BASE, body);

const CARS = [
  { label: "Murcielago LP640 2007", typed: "2007 Lamborghini Murcielago LP640 Coupe", vehicle: { make: "Lamborghini", model: "Murcielago", trim: "LP640", year: 2007, bodyStyle: "coupe" } },
];
let fails = 0;
for (const c of CARS) {
  const A = await poolOf({ oneBox: true, car: c.typed });
  const B = await poolOf({ oneBox: true, car: { vehicle: c.vehicle } });
  const same = JSON.stringify(A.ids) === JSON.stringify(B.ids);
  const both1 = A.n <= 1 && B.n <= 1;   // the old bug: 1-sale pool
  const ok = same && !both1;
  if (!ok) fails++;
  console.log((ok ? "PASS " : "FAIL ") + c.label);
  console.log(`  typed:  tier=${A.tier} n=${A.n} range=$${A.lo}-$${A.hi}`);
  console.log(`  vin:    tier=${B.tier} n=${B.n} range=$${B.lo}-$${B.hi}`);
  if (!same) {
    const inA = A.ids.filter(x => !B.ids.includes(x)), inB = B.ids.filter(x => !A.ids.includes(x));
    console.log(`  DIFFER  only-in-typed: ${inA.slice(0,6).join("; ")||"-"}`);
    console.log(`          only-in-vin:   ${inB.slice(0,6).join("; ")||"-"}`);
  } else { console.log(`  same pool (${A.n} sales): ${A.ids.slice(0,10).join("; ")}`); }
}
await b.close();
console.log(`\n${fails ? fails + " FAILURE(S): typed and VIN pools differ." : "Typed and VIN read the same pool."}`);
process.exit(fails ? 1 : 0);
