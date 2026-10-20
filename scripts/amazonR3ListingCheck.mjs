// AMAZON DEMO REVISION 3, STAGE R3-B items 3 and 4 (Sam, Oct 20 2026): the full listing block for every car, the C63's fixed
// sample price, typed cars with "Price set by dealer" and no figures, the inviting Market Check row, Arial and Helvetica
// only. Every sample figure is a fixed constant; the page adds up nothing. No network.
//   node scripts/amazonR3ListingCheck.mjs     exit 1 on any failure.
import { amazonPageHtml, AMAZON_PROFILE as P } from "../api/_amazonDemo.js";
import { carOf, DUMMY } from "../api/partnerDemo.js";
import { AMAZON_DEMO_CARS as CARS } from "../api/_amazonDemoCars.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const h = amazonPageHtml("c", "2", { carOf, listing: DUMMY }), js = h.slice(h.indexOf("<script>") + 8, h.lastIndexOf("</script>"));
const page = h.replace(/<script>[\s\S]*<\/script>/, "");
// the constants: fixed whole numbers, and the one formula ($3,500 down, 72 months, 7.98% APR) reproduces them (a check, never run in the page)
const r = 0.0798 / 12;
for (const c of CARS) { const sl = P.sampleListings[c] || {};
  ok(Number.isInteger(sl.price) && Number.isInteger(sl.monthly) && Number.isInteger(sl.total), `${c}: a fixed sample price, monthly and total (thin cars too)`);
  const m = (sl.price - 3500) * r / (1 - Math.pow(1 + r, -72));
  ok(Math.round(m) === sl.monthly && Math.round(m * 72 + 3500) === sl.total, `${c}: the monthly and total follow the one fixed formula`); }
ok(P.sampleListings["2016 Mercedes-Benz C63 AMG"].price === 54900 && P.sampleListings["2016 Mercedes-Benz C63 AMG"].monthly === 901, "the C63's sample price is $54,900, $901 a month (Sam)");
ok(P.financeTerms === "$3,500 down • 72 months • 7.98% APR" && /esc\(TERMS\) \+ " \\u00b7 Sample/.test(js), "the terms line, labelled Sample");
// the block, in the page's order
for (const w of ["Finance", "Last updated ", "/mo", "Estimate payments", "Total payments ", "Cash", "See price details", "Price set by dealer", "Sample asking price"]) ok(js.includes(w) || page.includes(w), `the block carries '${w}'`);
ok(/<span class="cash-l">Cash<\/span>/.test(js) && /\(sl \? '<div class="cash">/.test(js), "the Cash row only for a car with a sample price (a typed car has none)");
ok(/'<div class="price dset">Price set by dealer<\/div>'/.test(js) && /\(sl \? '<p class="fin-m">'/.test(js) && /\(sl \? '<p class="fin-x">Total payments '/.test(js), "a typed car: 'Price set by dealer', and no monthly, terms or total figure");
ok(/\(sl && ru \? '<p class="fin-u">'/.test(js) && /function readDate\(a\)\{ var m = \/\^\(\\d\{4\}\)-\(\\d\\d\)-\(\\d\\d\)\/\.exec\(String\(\(a && a\.readAt\) \|\| ""\)\);/.test(js), "'Last updated' is the stored answer's own read date, nothing made up");
ok((js.match(/class="btn yel blk" data-inert>Estimate payments</g) || []).length === 1 && /class="ico" data-inert aria-label="Save"/.test(js) && /class="ico" data-inert aria-label="Share"/.test(js) && /class="arr l" data-inert/.test(js), "Estimate payments, the heart, the share icon and the photo arrows are inert");
ok(!/(price|monthly|total|low|high)\s*[*\/+-]\s*[\d(]/.test(js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/\/\^[^\n]*?\/\.exec/g, "")), "no price arithmetic anywhere in the page script");
// item 4, the row
ok(P.moduleLine === "See what cars like this actually sold for." && /<button type="button" class="mc-row" data-mc-toggle aria-expanded="false" aria-controls="mc-body">/.test(page), "the whole row is one button, with Sam's approved line");
ok(/<span class="mc-n">Market Check <span class="attr">powered by GoAskSam<\/span><\/span>/.test(page) && /<span class="chev"><span class="chev-t">Show<\/span><svg/.test(page) && /class="mc-ico"/.test(page), "an icon, 'Market Check' bold, 'powered by GoAskSam' small, a clear Show with a chevron");
const fin = page.indexOf('<div id="c-fin">'), mc = page.indexOf('<div class="mc" id="c-mc"'), body = page.indexOf('<div class="mc-body" id="mc-body"'), below = page.indexOf('<div class="below">'), stabs = page.indexOf('<div class="stabs"');
ok(fin > 0 && mc > fin, "Market Check directly under the Cash row");
ok(below > 0 && body > below && body < stabs, "the open card sits FULL WIDTH under the photo and buy box (first in the full-width section)");
ok(/mc\.classList\.toggle\("open", open\)/.test(js) && /\.querySelector\("\.chev-t"\)/.test(js), "Show and Hide still work");
// the look
ok(!/Amazon Ember/.test(h) && !/@font-face|@import|<link\b/.test(h) && /--sans:Arial,Helvetica,sans-serif/.test(h), "Arial and Helvetica only; no font file loaded");
ok(!/[–—]/.test(h), "no dashes");
console.log(`amazonR3ListingCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
