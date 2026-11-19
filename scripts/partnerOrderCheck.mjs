// PARTNEROREDERCHECK (Lane E, Nov 1 2026; Sam's live look at goasksam.com/preview?view=b, "Highest price" showed the newest five): each sort order picks its five from the engine's FULL set of included sales.
// CAUSE (Lane B's lib/onebox.js partnerSalesOf): order "price" was `cards.slice()`, the answer's own card order (date order on that car), not a sort by price, so it returned the same five as "Newest" and the highest sale
// ($76,000) was never in the five. The page sends order "price" (proved in partnerDemoCheck) and sorts nothing. CLASS: every demo car and every order, on a single range and on every option of an apart answer.
// TRUTH: the engine's own full set (the answer's cards / the option's rows), ordered here by the plain rule for each order; the five the engine returns must equal that.
//   node scripts/partnerOrderCheck.mjs      exit 1 on any failure
import { partnerPositionsOf } from "../lib/onebox.js";
import { DEMO_CARS } from "../api/partnerAnswer.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const key = s => `${s.date} $${s.price}${s.miles ? " " + s.miles + "mi" : ""}`;
const t = d => Date.parse(String(d).slice(0, 10));
// a small deterministic generator, so each demo car gets its own set of sales
const rng = seed => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const salesFor = (name, n, base, spread) => { const r = rng([...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0); return Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2026, 9, 28) - Math.floor(r() * 330) * 864e5).toISOString().slice(0, 10), price: Math.round((base + r() * spread) / 500) * 500, mi: 4000 + Math.floor(r() * 90000) })); };
const asCards = (rows, tag) => rows.map((x, i) => ({ id: `00000000-0000-4000-8000-${tag}${String(i).padStart(11 - String(tag).length, "0")}`, date: x.date, price: x.price, mi: x.mi, title: "Test car", image: "https://img.example/ok.svg" }));
const ORDERS = { date: (a, b) => t(b.date) - t(a.date) || b.price - a.price, price: (a, b) => b.price - a.price || t(b.date) - t(a.date), miles: m => (a, b) => Math.abs(a.mi - m) - Math.abs(b.mi - m) || t(b.date) - t(a.date) };
const truth = (rows, order, m) => rows.slice().sort(order === "miles" ? ORDERS.miles(m) : ORDERS[order]).slice(0, 5).map(x => `${x.date} $${x.price} ${x.mi}`);
const got = s => s.map(x => `${x.date} $${x.price} ${x.miles}`);
const MILES = 25000;
const cardOrders = { "date order (newest first)": rows => rows.slice().sort(ORDERS.date), "price order (highest first)": rows => rows.slice().sort(ORDERS.price), "archive order (as stored)": rows => rows.slice() };
for (const car of DEMO_CARS.concat(["2008 Porsche 911 Carrera S"])) {
  const rows = salesFor(car, 12, 60000, 90000), top = rows.reduce((m, x) => Math.max(m, x.price), 0);
  for (const [cn, arrange] of Object.entries(cardOrders)) {
    const cards = asCards(arrange(rows), "1"), lows = rows.map(x => x.price), d = { cluster: [Math.min(...lows), Math.max(...lows)], cards, rawPool: cards, options: [], optionsState: "alike" };
    for (const order of ["date", "price", "miles"]) {
      const px = partnerPositionsOf(d, { order, mileage: order === "miles" ? MILES : null, prices: { starting_bid: 70000 } });
      const want = truth(rows, order, MILES), have = got(px.sales);
      ok(JSON.stringify(have) === JSON.stringify(want), `${car}, cards in ${cn}, order ${order}: the five are not the right five in the right order\n   engine: ${have.join(" | ")}\n   truth:  ${want.join(" | ")}`);
      if (order === "price") ok(px.sales.length > 0 && px.sales[0].price === top, `${car}, cards in ${cn}: "price" must include and lead with the highest sale ($${top}), got $${px.sales[0] && px.sales[0].price}`);
    }
  }
  // an answer that prices apart: each option's five come from that option's own sales
  const A = salesFor(car + "A", 9, 40000, 20000), B = salesFor(car + "B", 9, 80000, 30000);
  const rowsAB = [...A.map((x, i) => ({ ...x, id: "a" + i, year: 2008, _usd: x.price, mileage: String(x.mi), rtitle: "2008 Test Car Coupe", auction_end_date: x.date, image: "https://img.example/ok.svg" })), ...B.map((x, i) => ({ ...x, id: "b" + i, year: 2008, _usd: x.price, mileage: String(x.mi), rtitle: "2008 Test Car Cabriolet", auction_end_date: x.date, image: "https://img.example/ok.svg" }))];
  const range = xs => ({ low: Math.min(...xs.map(x => x.price)), high: Math.max(...xs.map(x => x.price)) });
  const ra = range(A), rb = range(B);
  const dA = { cluster: null, tier: "result", optionsState: "apart", headlineDimension: "body", options: [{ dimension: "body", value: "coupe", label: "Coupe", n: 9, low: ra.low, high: ra.high, rangeFloor: false }, { dimension: "body", value: "open", label: "Cabriolet", n: 9, low: rb.low, high: rb.high, rangeFloor: false }], rawPool: rowsAB, cards: [] };
  for (const order of ["date", "price", "miles"]) {
    const po = partnerPositionsOf(dA, { order, mileage: order === "miles" ? MILES : null, prices: { starting_bid: 60000 } }).perOption;
    ok(po && po.options.length === 2, `${car}, apart, order ${order}: the answer carries both options`);
    if (!po) continue;
    [[A, "Coupe"], [B, "Cabriolet"]].forEach(([rowsO, label], i) => {
      const want = truth(rowsO, order, MILES), have = got(po.options[i].sales);
      ok(JSON.stringify(have) === JSON.stringify(want), `${car}, apart ${label}, order ${order}: the five are not the right five in the right order\n   engine: ${have.join(" | ")}\n   truth:  ${want.join(" | ")}`);
    });
  }
}
console.log(`partnerOrderCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
