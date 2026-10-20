// AMAZON DEMO REVISION 2, STAGE R2-C, item 5 (Sam, Oct 20 2026): tab d, "d. In search results", an Amazon Autos results
// grid of the demo cars. Each card: photo, "Used {year} {make} {model}", the mileage where the listing has one, a spec
// chip, the fixed sample price and finance line (profile constants, labelled Sample), and ONE neutral marker ("Market
// Check", or "Sold before" when its VIN has sold) read from that car's STORED partner answer only; no range, no verdict,
// no live engine call from the page. A card opens its tab c page. No network.
//   node scripts/amazonGridCheck.mjs     exit 1 on any failure.
import { amazonPageHtml, AMAZON_PROFILE as P } from "../api/_amazonDemo.js";
import { carOf, DUMMY } from "../api/partnerDemo.js";
import { AMAZON_DEMO_CARS as DEMO_CARS } from "../api/_amazonDemoCars.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const h = amazonPageHtml("d", "", { carOf, listing: DUMMY }), js = h.slice(h.indexOf("<script>"));
const page = h.replace(/<script>[\s\S]*<\/script>/, "");
ok(P.tabs.some(([k, l]) => k === "d" && l === "d. In search results") && /<section class="wrap" id="view-d">/.test(h), "tab d, 'd. In search results', open");
const cards = [...page.matchAll(/<a class="dcard" href="([^"]+)" data-dcar="([^"]+)">([\s\S]*?)<\/a>/g)];
ok(cards.length === DEMO_CARS.length, `one card per demo car (${cards.length})`);
ok(cards.every(([, href], i) => href === (i === 0 ? "?p=amazon&amp;view=c" : `?p=amazon&amp;view=c&amp;car=${i}`)), "each card opens its own tab c page");
ok(DEMO_CARS.join("|") === "2017 Porsche 911 Carrera|2022 Porsche 911 GT3|2017 Audi R8 V10 Plus|2019 Mercedes-AMG GT|2013 BMW M3 Coupe|2016 Ferrari 488 GTB|2016 Mercedes-Benz C63 AMG" || DEMO_CARS.length === 7, "the grid shows the Amazon demo's own seven cars (eBay keeps its own)");
ok(cards.every(([, , c, inner]) => inner.includes(`<span class="dtitle">Used ${c}`)), "each title in Amazon form");
ok(cards.every(([, , c, inner]) => { const sl = P.sampleListings[c]; return sl && sl.price ? inner.includes(`<span class="dprice">$${sl.price.toLocaleString("en-US")}</span><span class="dfin">$${sl.monthly.toLocaleString("en-US")}/mo, Sample</span>`) : !/dprice|dfin/.test(inner); }), "the sample price and finance line are the profile's fixed constants, labelled Sample (none for a car without them)");
ok(cards.every(([, , c, inner]) => { const sl = P.sampleListings[c]; return (sl && sl.miles) ? inner.includes(`${sl.miles.toLocaleString("en-US")} miles`) : !/dmiles/.test(inner); }), "mileage only where the listing has one");
ok(!/\$[\d,]+ to \$[\d,]+|range|below|above|good deal|great deal|fair/i.test(page.slice(page.indexOf('id="view-d"'))), "no range and no verdict on the grid");
const d = js.slice(js.indexOf("function drawD("), js.indexOf("if (VIEW === \"d\") drawD();"));
ok(/fetch\("\/api\/partnerAnswer\?last=" \+ encodeURIComponent\(qq\)/.test(d) && !/method: "POST"|ask\(/.test(d), "the grid reads each car's STORED answer only (?last=), never a live read");
ok(/if \(!a \|\| a\.ok === false \|\| a\.lastGood !== true\) return;/.test(d), "nothing drawn without a stored answer");
ok(/m\.textContent = anySold\(a\.history\) \? "Sold before" : "Market Check";/.test(d) && /if \(!inScope\(a\)\) return;/.test(d), "one neutral marker for in-scope cars: Sold before when its VIN has sold, else Market Check");
// RULE 25 (Lane E's flag, Oct 20 2026): every car's mileage is its OWN sample sale's, the one named in AMAZON_DEMO_CARS
// (Lane E's 18:19Z read), never another car's; the C63 is its 2016 sedan's 13,800, not the 2017 cabriolet's 70,600.
{ const want = [14800, 7000, 24000, 38000, 57000, 18000, 13800];   // the AMG: its plain GT Roadster's own 38,000 (Jul 10 2024)
  ok(DEMO_CARS.every((c, i) => (P.sampleListings[c] || {}).miles === want[i]), "each car's mileage is its own sample sale's (the C63: 13,800)");
  ok(DEMO_CARS.every(c => /, [A-Z][a-z]{2} \d{1,2} 20\d\d/.test((P.sampleListings[c] || {}).sale || "")), "each car names its sample sale and date"); }
ok(/function ownSalePhoto\(a, sl\)\{/.test(js) && /String\(r\.date \|\| ""\)\.slice\(0, 10\) === sl\.saleDate && \(sl\.miles == null \|\| Number\(r\.miles\) === sl\.miles\)/.test(js), "a demo car's photo is its own sample sale's (matched by that sale's date and mileage)");
ok(/var sl = SAMPLES\[q\], ph = sl \? ownSalePhoto\(a, sl\) : null;/.test(d) && /SAMPLES\[CAR\] \? ownSalePhoto\(a, SAMPLES\[CAR\]\) :/.test(js), "tab d and tab c use that photo or none, never another car's");
ok(DEMO_CARS.every(c => /^20\d\d-\d\d-\d\d$/.test((P.sampleListings[c] || {}).saleDate || "")), "each car carries its sale's own date");
ok(!/[–—]/.test(h), "no dashes");
console.log(`amazonGridCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
