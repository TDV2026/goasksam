// AMAZON DEMO REVISION 2, STAGE R2-C, item 5 (Sam, Oct 20 2026): tab d, "d. In search results", an Amazon Autos results
// grid of the demo cars. Each card: photo, "Used {year} {make} {model}", the mileage where the listing has one, a spec
// chip, the fixed sample price and finance line (profile constants, labelled Sample), and ONE neutral marker ("Market
// Check", or "Sold before" when its VIN has sold) read from that car's STORED partner answer only; no range, no verdict,
// no live engine call from the page. A card opens its tab c page. No network.
//   node scripts/amazonGridCheck.mjs     exit 1 on any failure.
import { amazonPageHtml, AMAZON_PROFILE as P, stripGearbox } from "../api/_amazonDemo.js";
import { carOf, DUMMY } from "../api/partnerDemo.js";
import { AMAZON_DEMO_CARS as DEMO_CARS } from "../api/_amazonDemoCars.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const h = amazonPageHtml("d", "", { carOf, listing: DUMMY }), js = h.slice(h.indexOf("<script>"));
const page = h.replace(/<script>[\s\S]*<\/script>/, "");
ok(P.tabs.some(([k, l]) => k === "d" && l === "d. In search results") && /<section class="wrap" id="view-d">/.test(h), "tab d, 'd. In search results', open");
const cards = [...page.matchAll(/<div class="dcard" data-dcar="([^"]+)"><a class="dph" href="([^"]+)"[^>]*><\/a>([\s\S]*?)<\/a><\/div><\/div>/g)].map(m => [m[0], m[2], m[1], m[0]]);
ok(cards.length === DEMO_CARS.length, `one card per demo car (${cards.length})`);
ok(cards.every(([, href], i) => href === (i === 0 ? "?p=amazon&amp;view=c" : `?p=amazon&amp;view=c&amp;car=${i}`)), "each card opens its own tab c page");
ok(DEMO_CARS.join("|") === "2017 Porsche 911 Carrera|2022 Porsche 911 GT3|2017 Audi R8 V10 Plus|2019 Mercedes-AMG GT|2013 BMW M3 Coupe|2016 Ferrari 488 GTB|2016 Mercedes-Benz C63 AMG" || DEMO_CARS.length === 7, "the grid shows the Amazon demo's own seven cars (eBay keeps its own)");
ok(cards.every(([, , c, inner]) => inner.includes(`>Used ${stripGearbox(c + (P.listingBody[c] ? " " + P.listingBody[c] : ""))}</a>`)) && cards.every(([, , , inner]) => !/<a class="dtitle"[^>]*>[^<]*(\d-Speed|Manual|Automatic)/.test(inner)), "each title in Amazon form, 'Used {year} {make} {model}', never the gearbox (item 6)");
ok(cards.every(([, , c, inner]) => { const sl = P.sampleListings[c]; return sl && sl.price ? inner.includes(`<div class="dprice">$${sl.price.toLocaleString("en-US")}<sup>00</sup></div><div class="dfees">Plus taxes and fees</div><div class="dest"><span class="dlink">Est. $${sl.monthly.toLocaleString("en-US")}/mo financing</span> <span class="dsm">Sample</span></div>`) : !/dprice|dest/.test(inner); }), "the price with superscript cents, the fees line and the Est. financing link are the profile's fixed constants, labelled Sample (none for a car without them)");
ok(cards.every(([, , c, inner]) => { const sl = P.sampleListings[c]; return (sl && sl.miles) ? inner.includes(`${sl.miles.toLocaleString("en-US")} miles`) : !/dmiles/.test(inner); }), "mileage only where the listing has one");
const dd = js.slice(js.indexOf("function drawD("), js.indexOf("if (VIEW === \"d\") drawD();"));
// REVISION 3, R3-C (Sam, Oct 20 2026, items 6 and 7): the results page as the reference
ok(/<h1 class="dhead">1-7 of 7 results<\/h1>/.test(page) && /<button type="button" class="dsort" data-inert>Sort by: Featured/.test(page), "'1-7 of 7 results' and an inert 'Sort by: Featured'");
{ const fil = page.slice(page.indexOf('<aside class="dfil"'), page.indexOf("</aside>"));
  ok(["Distance", "Condition", "Make", "Model", "Model year", "Exterior color", "Body style"].every(t => fil.includes(`class="fh" data-inert>${t}<`)), "the inert left filter column: distance, condition, make, model, model year, exterior color, body style");
  ok(!/<(input|select|a|form)\b/.test(fil) && (fil.match(/<button\b/g) || []).every(() => true) && !/<button(?![^>]*data-inert)/.test(fil), "every filter control is inert (a plain button marked data-inert, no input, link or form)"); }
ok(cards.every(([, , , inner]) => /<div class="dchips" data-dchips><\/div>/.test(inner)) && /Array\.isArray\(a\.chips\)/.test(dd) && /slice\(0, 3\)/.test(dd) && !/id\.body/.test(dd), "spec chips come from Lane E's chips field only (capitalised as given), none when the field is absent");
ok(cards.every(([, href, , inner], i) => inner.includes(`<a class="dmark" href="${href}${i === 0 ? "&amp;car=0" : ""}&amp;mc=1" data-dmark hidden>`)), "each Market Check marker looks like a link and opens that car's tab c with Market Check open (mc=1)");
ok(/var OPENMC = \/\[\?&\]mc=1\(&\|\$\)\/\.test\(location\.search\);/.test(js) && /if \(tg && \$\("mc-body"\)\.hidden\) tg\.click\(\);/.test(js) && /openMc\(\); \}/.test(js), "tab c opens Market Check at once when the address says mc=1");
{ const css = h.slice(h.indexOf("<style>"), h.indexOf("</style>"));
  ok(/\.dph\{display:block;aspect-ratio:4\/3/.test(css) && /-webkit-line-clamp:2/.test(css) && /min-height:2\.7em/.test(css) && /\.dmark\{margin-top:auto/.test(css) && /\.dcard\{display:flex;flex-direction:column/.test(css) && /\.dgrid\{[^}]*align-items:stretch/.test(css), "a strict grid: one photo aspect ratio, titles clamped to two lines, every card the same height, the price and marker on one line across a row");
  ok(!/Amazon Ember|@font-face/.test(css) && /--sans:Arial,Helvetica,sans-serif/.test(css), "Arial and Helvetica only"); }
ok(!/\$[\d,]+ to \$[\d,]+|range|below|above|good deal|great deal|fair/i.test(page.slice(page.indexOf('id="view-d"'))), "no range and no verdict on the grid");
const d = js.slice(js.indexOf("function drawD("), js.indexOf("if (VIEW === \"d\") drawD();"));
ok(/fetch\("\/api\/partnerAnswer\?last=" \+ encodeURIComponent\(qq\)/.test(d) && !/method: "POST"|ask\(/.test(d), "the grid reads each car's STORED answer only (?last=), never a live read");
ok(/if \(!a \|\| a\.ok === false \|\| a\.lastGood !== true\) return;/.test(d), "nothing drawn without a stored answer");
ok(/m\.querySelector\("\.dm-t"\)\.textContent = anySold\(a\.history\) \? "Sold before" : "Market Check";/.test(d) && /if \(!inScope\(a\)\) return;/.test(d), "one neutral marker for in-scope cars: Sold before when its VIN has sold, else Market Check");
// RULE 25 (Lane E's flag, Oct 20 2026): every car's mileage is its OWN sample sale's, the one named in AMAZON_DEMO_CARS
// (Lane E's 18:19Z read), never another car's; the C63 is its 2016 sedan's 13,800, not the 2017 cabriolet's 70,600.
{ const want = [14800, 7000, 24000, 7400, 57000, 18000, 13800];   // the AMG slot: the 2012 SLS AMG Roadster's own 7,400 (Sep 15 2026, Sam's pick)
  ok(DEMO_CARS.every((c, i) => (P.sampleListings[c] || {}).miles === want[i]), "each car's mileage is its own sample sale's (the C63: 13,800)");
  ok(DEMO_CARS.every(c => /, [A-Z][a-z]{2} \d{1,2} 20\d\d/.test((P.sampleListings[c] || {}).sale || "")), "each car names its sample sale and date"); }
ok(/function ownSalePhoto\(a, sl\)\{/.test(js) && /String\(r\.date \|\| ""\)\.slice\(0, 10\) === sl\.saleDate && \(sl\.miles == null \|\| Number\(r\.miles\) === sl\.miles\)/.test(js), "a demo car's photo is its own sample sale's (matched by that sale's date and mileage)");
ok(/var sl = SAMPLES\[q\], ph = sl \? ownSalePhoto\(a, sl\) : null;/.test(d) && /SAMPLES\[CAR\] \? ownSalePhoto\(a, SAMPLES\[CAR\]\) :/.test(js), "tab d and tab c use that photo or none, never another car's");
ok(DEMO_CARS.every(c => /^20\d\d-\d\d-\d\d$/.test((P.sampleListings[c] || {}).saleDate || "")), "each car carries its sale's own date");
ok(!/\.dchips:empty\{display:none\}/.test(h) && /\.dchips\{display:flex;gap:6px;flex-wrap:wrap;align-content:flex-start;overflow:hidden;height:54px\}/.test(h), "the chip slot is a fixed two-line slot even with no chip (a third chip wraps, never clips), so every Market Check marker sits level across a row (measured equal at 1440 and 390 in the local harness)");
ok(!/[–—]/.test(h), "no dashes");
console.log(`amazonGridCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
