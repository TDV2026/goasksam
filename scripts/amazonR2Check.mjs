// AMAZON DEMO REVISION 2, STAGE R2-B (Sam, Oct 20 2026): tab c in the Amazon Autos listing layout inside the demo shell
// (items 2 and 3), and sales shown, not linked (item 4). Presentation only: every figure and line comes from the partner
// answer; the sample price, the sample monthly figure and the mileage are fixed profile constants. No network.
//   node scripts/amazonR2Check.mjs     exit 1 on any failure.
import { amazonPageHtml, AMAZON_PROFILE as P } from "../api/_amazonDemo.js";
import { carOf, DUMMY } from "../api/partnerDemo.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const pages = ["a", "b", "c"].map(v => [v, amazonPageHtml(v, "1965 Ford Mustang", { carOf, listing: DUMMY })]);
const c = pages[2][1], js = c.slice(c.indexOf("<script>"));
// item 2: the shell, the sub-nav, the layout
for (const [v, h] of pages) ok(/<span class="prep">Prepared for Amazon<\/span><span class="demo-lab">Demo<\/span>/.test(h) && /class="demo-bar"/.test(h), `tab ${v}: the demo bar, "Prepared for Amazon" and "Demo" on the screen`);
ok(P.subnav.join("|") === "New Cars|Used Cars|Certified Pre-Owned|Trade|Body Type|Make|Fuel Type" && P.subnav.every(t => c.includes(`<button type="button" class="snav" data-inert>${t}</button>`)), "the white Autos sub-nav, every item inert");
ok(/<a class="back-l" href="\?p=amazon&amp;view=d">&lsaquo; Back to search results<\/a>/.test(c), "Back to search results opens tab d (Sam's word: the only navigation besides the tabs)");
ok(/<div class="galwrap"><div class="gal" id="c-photo"><\/div><div class="thumbs" id="c-thumbs" aria-hidden="true"><\/div><\/div>/.test(c), "the large photo with a thumbnail strip beside it");
ok(/<h1 id="c-title">Used 1965 Ford Mustang Fastback<\/h1>/.test(c) && /return "Used " \+ out\.join\(" "\);/.test(js), "the title in Amazon form, from the VIN's decode or the answer's identity (never the VIN)");
ok(P.sectionTabs.join("|") === "Overview|Condition|Coverage|Benefits|Pricing" && /data-stab="overview"/.test(c) && /data-stab="pricing"/.test(c) && (c.match(/class="stab" data-inert/g) || []).length === 3, "the section tabs: Overview and Pricing switch, the other three inert");
ok(/<h2>Key features<\/h2>/.test(c) && /KF\.filter\(function\(k\)\{ return f\[k\[0\]\] != null && String\(f\[k\[0\]\]\)\.trim\(\); \}\)/.test(js) && /\$\("c-kfsec"\)\.hidden = !kf;/.test(js), "Key features from the answer's own decode, a field left out when unknown, the section hidden when none is");
ok(/<h2>History and condition<\/h2>/.test(c) && /This car has previous market history/.test(js) && /See earlier sales/.test(js), "History and condition: the car's own earlier sales");
ok(/<span class="fin-l">Finance<\/span>/.test(js) && /\\u00b7 Sample<\/p>/.test(js) && /usd\(sl\.monthly\)/.test(js) && /<span class="cash-l">Cash<\/span><b class="cash-r">' \+ usd\(sl\.price\)/.test(js), "the Finance box and the Cash row from the fixed constants, labelled Sample");
ok(/sl\.miles \? '<p class="miles">'/.test(js), "the mileage only when the listing has one");
ok(/<button type="button" class="btn yel blk" data-inert>Estimate payments<\/button>/.test(js) && (js.match(/Estimate payments/g) || []).length === 1, "'Estimate payments' in the Finance box, an inert button like the reference (Sam's word)");
// item 3: where Market Check sits
const fin = c.indexOf('<div id="c-fin">'), mc = c.indexOf('<div class="mc" id="c-mc"'), pd = c.indexOf('class="pdet"'), pr = c.indexOf('<div id="c-price">');
ok(pr > 0 && fin > pr && mc > fin && pd > mc, "Market Check directly under the Cash row, never beside the price");
ok(/<span class="mc-n">Market Check <span class="attr">powered by GoAskSam<\/span><\/span><span class="mc-s">See what cars like this actually sold for\.<\/span>/.test(c), "the row reads 'Market Check powered by GoAskSam' with Sam's approved line");
ok(/\$\("c-pcard"\)\.innerHTML = scope \? mcCard\(a\) : "";/.test(js), "the same card in the Pricing tab");
ok(P.cardContext === "These are completed auction sales. Dealer prices can include reconditioning, warranty and delivery." && /'<p class="mc-ctx">' \+ esc\(CONTEXT\)/.test(js), "the Amazon-only context line under the card, in Sam's words");
// item 4: sales shown, not linked
for (const [v, h] of pages) { const hrefs = [...h.matchAll(/href="([^"]+)"/g)].map(m => m[1]).filter(x => !/^\?p=amazon|^https:\/\/fonts\./.test(x)); ok(hrefs.length === 0, `tab ${v}: no link leaves the demo (${hrefs.join(", ")})`); }
ok(!/Bring a Trailer|Cars & Bids|RM Sotheby|Gooding|Bonhams|Mecum|Barrett|Broad Arrow|Hemmings|\bPCAR\s?Market\b|Collecting Cars/i.test(c.replace(/<script>[\s\S]*<\/script>/, "")), "no auction site named on the page");
ok(!/<a [^>]*href/.test(js.replace(/<a href="' \+ esc\(carQ/g, "")), "the page's script draws no link of its own");
ok(!/[–—]/.test(c), "no dashes");
console.log(`amazonR2Check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
