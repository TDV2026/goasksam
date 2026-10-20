// AMAZON DEMO REVISION 2, STAGE R2-C, item 5 (Sam, Oct 20 2026): tab d, "d. In search results", an Amazon Autos results
// grid of the demo cars. Each card: photo, "Used {year} {make} {model}", the mileage where the listing has one, a spec
// chip, the fixed sample price and finance line (profile constants, labelled Sample), and ONE neutral marker ("Market
// Check", or "Sold before" when its VIN has sold) read from that car's STORED partner answer only; no range, no verdict,
// no live engine call from the page. A card opens its tab c page. No network.
//   node scripts/amazonGridCheck.mjs     exit 1 on any failure.
import { amazonPageHtml, AMAZON_PROFILE as P } from "../api/_amazonDemo.js";
import { carOf, DUMMY } from "../api/partnerDemo.js";
import { DEMO_CARS } from "../api/partnerAnswer.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const h = amazonPageHtml("d", "", { carOf, listing: DUMMY }), js = h.slice(h.indexOf("<script>"));
const page = h.replace(/<script>[\s\S]*<\/script>/, "");
ok(P.tabs.some(([k, l]) => k === "d" && l === "d. In search results") && /<section class="wrap" id="view-d">/.test(h), "tab d, 'd. In search results', open");
const cards = [...page.matchAll(/<a class="dcard" href="([^"]+)" data-dcar="([^"]+)">([\s\S]*?)<\/a>/g)];
ok(cards.length === DEMO_CARS.length, `one card per demo car (${cards.length})`);
ok(cards.every(([, href], i) => href === (i === 0 ? "?p=amazon&amp;view=c" : `?p=amazon&amp;view=c&amp;car=${i}`)), "each card opens its own tab c page");
ok(cards.every(([, , c, inner]) => inner.includes(`<span class="dtitle">Used ${c}`)), "each title in Amazon form");
ok(cards.every(([, , c, inner]) => { const sl = P.sampleListings[c]; return sl ? inner.includes(`<span class="dprice">$${sl.price.toLocaleString("en-US")}</span><span class="dfin">$${sl.monthly.toLocaleString("en-US")}/mo, Sample</span>`) : !/dprice|dfin/.test(inner); }), "the sample price and finance line are the profile's fixed constants, labelled Sample (none for a car without them)");
ok(cards.every(([, , c, inner]) => { const sl = P.sampleListings[c]; return (sl && sl.miles) ? inner.includes(`${sl.miles.toLocaleString("en-US")} miles`) : !/dmiles/.test(inner); }), "mileage only where the listing has one");
ok(!/\$[\d,]+ to \$[\d,]+|range|below|above|good deal|great deal|fair/i.test(page.slice(page.indexOf('id="view-d"'))), "no range and no verdict on the grid");
const d = js.slice(js.indexOf("function drawD("), js.indexOf("if (VIEW === \"d\") drawD();"));
ok(/fetch\("\/api\/partnerAnswer\?last=" \+ encodeURIComponent\(qq\)/.test(d) && !/method: "POST"|ask\(/.test(d), "the grid reads each car's STORED answer only (?last=), never a live read");
ok(/if \(!a \|\| a\.ok === false \|\| a\.lastGood !== true\) return;/.test(d), "nothing drawn without a stored answer");
ok(/m\.textContent = anySold\(a\.history\) \? "Sold before" : "Market Check";/.test(d) && /if \(!inScope\(a\)\) return;/.test(d), "one neutral marker for in-scope cars: Sold before when its VIN has sold, else Market Check");
ok(!/[–—]/.test(h), "no dashes");
console.log(`amazonGridCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
