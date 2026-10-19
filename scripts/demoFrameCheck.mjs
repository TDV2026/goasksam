// THE PARTNER DEMO'S LISTING FRAME AND ITS READS (Sam's demo orders, Oct 19 2026; Lane C). Renders api/partnerDemo.js
// pageHtml in a real browser with /api/partnerAnswer answered from fixtures (no network): the six sample cars show the
// listing frame labelled "Sample listing", a round "Sample asking price" inside the engine's range with the buttons, no VIN
// and no "This car last sold"; a thin car and a car the engine asks about show no price and no buttons; the 2014 GT3
// keeps its real listing; each page asks for its car once; photos ask a width. Every figure on the card is the fixture's.
//   node scripts/demoFrameCheck.mjs     exit 1 on any failure.
import puppeteer from "puppeteer-core";
import { pageHtml } from "../api/partnerDemo.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const card = (lo, hi, n) => `<div class="sfc-card"><p class="sfc-range">$${lo.toLocaleString("en-US")} to $${hi.toLocaleString("en-US")}</p><div class="gas-pill-slot"></div><p class="sfc-basis">Based on ${n} sales, the latest in September 2026.</p></div>`;
const sale = (i, price) => ({ name: "A car like it", date: "2026-0" + (1 + (i % 8)) + "-1" + i, price, miles: null, photo: "0000000" + i });
const RANGE = (q, lo, hi, n) => ({ ok: true, query: q, answerType: "result", range: { low: lo, high: hi }, count: n, card: card(lo, hi, n), carPhoto: { photo: "00000099" }, sales: [sale(1, lo + 1000), sale(2, hi - 1000)], history: [] });
const ANS = {
  "2014 Porsche 911 GT3": RANGE("2014 Porsche 911 GT3", 115000, 130000, 17),
  "2015 Porsche 911 GT3": RANGE("2015 Porsche 911 GT3", 115500, 131000, 17),
  "2005 Porsche 911": RANGE("2005 Porsche 911", 31500, 44200, 40),
  "1957 Porsche 356 Speedster": RANGE("1957 Porsche 356 Speedster", 301000, 352000, 12),
  "2023 Porsche 911 GT3": RANGE("2023 Porsche 911 GT3", 238000, 259000, 20),
  "1966 Ferrari 275 GTB": { ok: true, query: "1966 Ferrari 275 GTB", answerType: "thin", range: null, thin: "The sales of this car are too one-sided to mark a range from.", card: '<div class="sfc-card"><p class="sfc-thin">The sales of this car are too one-sided to mark a range from.</p></div>', carPhoto: { photo: "00000098" }, sales: [sale(3, 2800000)], history: [] },
  "1965 Ford Mustang": { ok: true, query: "1965 Ford Mustang", answerType: "identity_question", range: null, question: { text: "Which Mustang?", options: [{ label: "Coupe", send: { q: "1965 Ford Mustang", refine: { body: "coupe" } } }, { label: "Fastback", send: { q: "1965 Ford Mustang", refine: { body: "fastback" } } }] }, sales: [], history: [] }
};
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
for (const car of Object.keys(ANS)) {
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
  const posts = [], photos = [];
  await p.setRequestInterception(true);
  p.on("request", r => {
    const u = new URL(r.url());
    if (u.pathname === "/preview") return r.respond({ status: 200, contentType: "text/html", body: pageHtml("c", car === "2014 Porsche 911 GT3" ? "" : car) });
    if (u.pathname === "/api/partnerAnswer" && r.method() === "POST") { const body = JSON.parse(r.postData() || "{}"); posts.push(body); const a = body.refine ? RANGE(car, 43500, 56500, 11) : ANS[car]; return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(a) }); }
    if (u.pathname === "/api/partnerAnswer" && u.searchParams.has("photo")) { photos.push(u.search); return r.respond({ status: 404, body: "" }); }
    return r.respond({ status: 404, body: "" });
  });
  await p.goto("https://demo.test/preview?view=c", { waitUntil: "load" });
  await p.waitForFunction(() => !document.querySelector("#c-rail .loading"), { timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 300));
  const s = await p.evaluate(() => { const v = document.getElementById("view-c"), t = v.innerText; return { tag: !!v.querySelector(".sample-tag"), tagText: (v.querySelector(".sample-tag") || {}).textContent || "", price: (v.querySelector("#c-sample .price, .rail .price") || {}).textContent || "", kind: (v.querySelector(".price-kind") || {}).textContent || "", buttons: v.querySelectorAll(".buy button").length, vin: /VIN /.test(t), lastSold: /This car last sold/.test(t), year: (v.querySelector(".desc dd") || {}).textContent || "", card: (v.querySelector("#c-rail .sfc-range, #c-rail .sfc-thin") || {}).textContent || "", q: /Which Mustang\?/.test(t), mileage: /Mileage|miles/i.test(((v.querySelector(".rail") || {}).innerText || "") + ((v.querySelector(".desc") || {}).innerText || "")) }; });
  const a = ANS[car];
  if (car === "2014 Porsche 911 GT3") {
    ok(!s.tag && s.vin && /139,900/.test(s.price) && s.buttons === 3 && s.mileage, "2014 GT3: its real listing, unchanged (VIN, $139,900, Buy It Now, mileage), no sample label");
  } else {
    ok(s.tag && s.tagText === "Sample listing", `${car}: "Sample listing" beside the title`);
    ok(!s.vin && !s.lastSold && !s.mileage, `${car}: no VIN, no "This car last sold", no mileage of its own (a sale row's mileage stays that sale's)`);
    ok(s.year === car.slice(0, 4), `${car}: About this car gives the year`);
    if (a.range) {
      const n = Number(s.price.replace(/[^\d]/g, ""));
      ok(n >= a.range.low && n <= a.range.high && n % 1000 === 0 && s.kind === "Sample asking price" && s.buttons === 3, `${car}: a round sample asking price inside the engine's range (${s.price}), labelled, with the buttons`);
      ok(s.card === `$${a.range.low.toLocaleString("en-US")} to $${a.range.high.toLocaleString("en-US")}`, `${car}: the card is the engine's own range`);
    } else {
      ok(!s.price && s.buttons === 0, `${car}: no range, so no price and no buttons`);
    }
    if (a.question) ok(s.q, `${car}: the engine's question, as asked`);
    if (a.thin) ok(s.card === a.thin, `${car}: the engine's thin line on the card`);
  }
  ok(posts.length === 1, `${car}: one read for the page (got ${posts.length})`);
  ok((a.question || photos.length > 0) && photos.every(x => /[?&]w=(320|640|960)\b/.test(x)), `${car}: every photo asks a width`);
  // The Mustang: answering the engine's question draws the answered car's range and the sample price.
  if (a.question) {
    await p.evaluate(() => { const b = [...document.querySelectorAll("#c-rail [data-send]")].find(x => /Fastback/.test(x.textContent)); if (b) b.click(); });
    await new Promise(r => setTimeout(r, 500));
    const s2 = await p.evaluate(() => ({ price: (document.querySelector("#c-sample .price") || {}).textContent || "", card: (document.querySelector("#c-rail .sfc-range") || {}).textContent || "" }));
    const n2 = Number(s2.price.replace(/[^\d]/g, ""));
    ok(s2.card === "$43,500 to $56,500" && n2 >= 43500 && n2 <= 56500, `${car}: after Fastback, the engine's range and a sample price inside it (${s2.price})`);
  }
  await p.close();
}
await b.close();
console.log(`demoFrameCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
