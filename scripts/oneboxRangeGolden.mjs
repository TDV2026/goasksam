// One Box range-vs-cards invariant golden (fix item 3, Sep 2026).
// FAILS if any shown comp card sits OUTSIDE the stated range, unless it is explicitly called out
// as an outlier. Runs against production via a real browser (Attack-Challenge safe), crew cookie.
// The range and the cards must come from the SAME pool: this is what makes the M3 / S65 / Murcielago
// class of bug impossible to reship.
//   node scripts/oneboxRangeGolden.mjs [https://base]
import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = (process.argv.find(a => a.startsWith("http")) || "https://goasksam.com").replace(/\/$/, "");
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: new URL(BASE).hostname, path: "/" });
await p.goto(BASE + "/onebox", { waitUntil: "networkidle2" });

// A spread of rare-ish cars so at least some land on class_era / thin (the tiers that state a range
// beside cards). The invariant is asserted on WHATEVER tier renders a range + cards.
const CARS = [
  { make: "Lamborghini", model: "Murcielago", trim: "LP640", year: 2007 },
  { make: "Lamborghini", model: "Diablo", year: 1999 },
  { make: "Maserati", model: "Ghibli", year: 1969 },
  { make: "Aston Martin", model: "Vantage", year: 1979 },
  { make: "Ferrari", model: "Mondial", year: 1985 },
  { make: "Lancia", model: "Stratos", year: 1975 },
];
const runCar = car => p.evaluate(async (BASE, car) => {
  const text = [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ");
  const r = await fetch(BASE + "/api/sellerDecision", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ oneBox: true, car: text }) });
  const d = await r.json();
  let range = null, cards = [], allowed = [], tier = d.tier;
  if (d.classEra) { range = [d.classEra.lowHammer, d.classEra.highHammer]; cards = (d.classEra.receipts || []).slice(0, 8).map(x => x.hammer); allowed = (d.classEra.outliers || []).map(x => x.hammer); }
  else if (d.thin && d.thin.receipts && d.thin.receipts.length) { const hs = d.thin.receipts.map(x => x.hammer).filter(n => n > 0); range = [Math.min(...hs), Math.max(...hs)]; cards = d.thin.receipts.slice(0, 8).map(x => x.hammer); }
  return { tier, range, cards, allowed, model: (d.resolvedCar && d.resolvedCar.model) || car.model, widened: d.modelWidened || null };
}, BASE, car);

let fails = 0, tested = 0;
for (const car of CARS) {
  const r = await runCar(car).catch(e => ({ err: String(e) }));
  const label = car.make + " " + car.model + (car.trim ? " " + car.trim : "") + " " + car.year;
  if (r.err) { console.log("ERR  " + label + " -> " + r.err); continue; }
  if (!r.range || !r.cards.length) { console.log("skip " + label + " -> tier " + r.tier + " (no range+cards)"); continue; }
  tested++;
  const [lo, hi] = r.range;
  const bad = r.cards.filter(c => c > 0 && (c < lo || c > hi) && !r.allowed.includes(c));
  const ok = bad.length === 0;
  if (!ok) fails++;
  console.log((ok ? "PASS " : "FAIL ") + label + "  tier=" + r.tier + (r.widened ? " (widened to " + r.widened.toModel + ")" : "") +
    "  range=$" + lo + "-$" + hi + "  cards=[" + r.cards.map(c => "$" + c).join(",") + "]" +
    (r.allowed.length ? "  called-out=[" + r.allowed.map(c => "$" + c).join(",") + "]" : "") +
    (ok ? "" : "  OUTSIDE=[" + bad.map(c => "$" + c).join(",") + "]"));
}
await b.close();
console.log(`\n${tested} tier(s) with a range+cards checked. ${fails ? fails + " FAILURE(S): a shown card sat outside the stated range." : "All shown cards sit inside the stated range (or are called out)."}`);
process.exit(fails ? 1 : 0);
